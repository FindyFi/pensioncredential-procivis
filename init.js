
import { Agent } from 'credential-agent-procivis'
import credentialSchema from './credentialschema.json' with { type: "json" }

const config = {
    "api_base": process.env.PROCIVIS_API_BASE || 'https://procivis.sandbox.findy.fi/api',
    "api_token": process.env.PROCIVIS_API_TOKEN || '',
    "token_endpoint": process.env.PROCIVIS_TOKEN_ENDPOINT || "https://keycloak.trial.procivis-one.com/realms/trial/protocol/openid-connect/token",
    "client_id": process.env.PROCIVIS_CLIENT_ID || "",
    "client_secret": process.env.PROCIVIS_CLIENT_SECRET || "",
    "server_host": process.env.PROCIVIS_SERVER_HOST || "localhost",
    "issuer_url": process.env.PROCIVIS_ISSUER_URL || "kela.pensiondemo.findy.fi"
}

const agentParams = {
  api_base: config.api_base
}
const authParams = {}
if (config.api_token) {
  authParams.api_token = config.api_token
}
else if (config.client_id && config.client_secret) {
  authParams.client_id = config.client_id
  authParams.client_secret = config.client_secret
  authParams.token_endpoint = config.token_endpoint
}
else {
  throw new Error('No authentication method configured!')
}
const agent = new Agent(agentParams)
await agent.authenticate(authParams)
await agent.setOrganization(await initOrg())
agent.keys = [ await initKey() ]
agent.dids = [ await initDID(agent.keys[0]) ]
agent.schemas.credential = await initCredentialSchema()
agent.schemas.proof = await initVerificationSchema()

export { agent }

async function initOrg() {
  const list = await agent.getOrganizations()
  let o
  if (list && list.values && list.values.length > 0) {
    o = list.values.at(0)
  }
  else if (typeof list === typeof []) {
    o = list.at(0)
  }
  if (!o) {
    o = await agent.createOrganization({ name: config.issuer_url })
  }
  return o
}

async function initKey() {
  let key = {}
  const list = await agent.getKeys({ name: credentialSchema.name })
  const id = list?.values?.at(0)?.id // use the first returned
  if (id) {
    key = list?.values?.at(0)
  }
  else {
    const data = {
      keyType: 'ECDSA',
      keyParams: {},
      name: credentialSchema.name,
      storageType: 'INTERNAL',
      storageParams: {}
    }
    key = await agent.createKey(data)
    console.log('New key: ', key)
  }
  return key?.id
}

async function initDID(key) {
  const listParams = {
    "didMethods[]": 'WEB',
    name: config.issuer_url,
    sort: 'createdDate',
    sortDirection: 'DESC'
  }
  const list = await agent.getDIDs(listParams)
  const id = list?.values?.at(0)?.id // use the first returned
  if (id) {
    const identifier = await agent.getDID(id)
    // console.log(JSON.stringify(identifier, null, 2))
    return identifier?.did?.id
  }
  else {
    const data = {
      name: config.issuer_url,
      method: 'WEB',
      keys: {
        authentication: [key],
        assertionMethod: [key],
        keyAgreement: [key],
        capabilityInvocation: [key],
        capabilityDelegation: [key]
      },
      params: {
        externalHostingUrl: `https://${config.issuer_url}`
      }
    }
    const identifier = await agent.createDID(data)
    return identifier?.did?.id
  }
}

async function initCredentialSchema() {
  const list = await agent.getCredentialSchemas({ name: credentialSchema.name, format: credentialSchema.format })
  const id = list?.values?.at(0)?.id // use the first returned
  let schema = {}
  if (id) {
    schema = await agent.getCredentialSchema(id)
  }
  else {
    const res = await agent.createCredentialSchema(credentialSchema)
    schema = await agent.getCredentialSchema(res.id)
  }
  return schema
}

async function initVerificationSchema() {
  const list = await agent.getVerificationSchemas({ name: agent.schemas.credential.name })
  const pid = list?.values?.at(0)?.id // use the first returned
  let schema = {}
  if (pid) {
    schema = await agent.getVerificationSchema(pid)
  }
  else {
    const cs = agent.schemas.credential
    const proofSchema = {
      name: cs.name,
      expireDuration: 0,
      proofInputSchemas: [
       {
        "credentialSchemaId": cs.id,
        "claimSchemas": [
        ]
       }
      ]
    }
    cs.claims.forEach(parent => {
      if (parent.key == 'Pension') {
        parent.claims.forEach(child => {
          if (['startDate', 'typeCode', 'typeName'].includes(child.key)) {
            proofSchema.proofInputSchemas[0].claimSchemas.push({
              id: child.id,
              required: true
            })
          }
        })
      }
      if (parent.key == 'Person') {
        parent.claims.forEach(child => {
          if (['personal_administrative_number'].includes(child.key)) {
            proofSchema.proofInputSchemas[0].claimSchemas.push({
              id: child.id,
              required: true
            })
          }
        })
      }
    })
    schema = await agent.createVerificationSchema(proofSchema)
  }
  return schema
}

async function clearSchemas() {
  let list = await agent.getCredentialSchemas()
  for (const item of list?.values || []) {
    await agent.deleteCredentialSchema(item.id)
  }
  list = await agent.getVerificationSchemas()
  for (const item of list?.values || []) {
    await agent.deleteVerificationSchema(item.id)
  }
}
