
import { Agent } from 'credential-agent-procivis'
import credentialSchema from './credentialschema.json' with { type: "json" }

const config = {
    "api_base": process.env.PROCIVIS_API_BASE || '',
    "api_token": process.env.PROCIVIS_API_TOKEN || '',
    "token_endpoint": process.env.PROCIVIS_TOKEN_ENDPOINT || "",
    "client_id": process.env.PROCIVIS_CLIENT_ID || "",
    "client_secret": process.env.PROCIVIS_CLIENT_SECRET || "",
    "server_host": process.env.PROCIVIS_SERVER_HOST || "localhost",
    "issuer_url": process.env.PROCIVIS_ISSUER_URL || "",
    "verifier_url": process.env.PROCIVIS_VERIFIER_URL || ""
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
agent.issuer = await initDID(config.issuer_url)
agent.verifier = await initDID(config.verifier_url)
// await clearSchemas()
agent.schemas.credential = await initCredentialSchema()
agent.schemas.proof = await initVerificationSchema()

export { agent }

async function initOrg() {
  const list = await agent.getOrganizations({sort: 'createdDate', sortDirection: 'DESC'})
  const orgs = list?.values || (Array.isArray(list) ? list : [])

  if (orgs.length === 0) {
    const created = await agent.createOrganization({})
    console.log('Created organisation:', created.id)
    return { id: created.id }
  }

  for (const org of orgs) {
    const dids = await agent.getDIDs({
      organisationId: org.id,
      "didMethods[]": 'WEB',
      name: config.issuer_url
    })
    if (dids?.values?.length > 0) {
      // console.log(`Found organisation ${org.id} with DID "${config.issuer_url}"`)
      return org
    }
  }
  return orgs[0]
}

async function initKey() {
  let key = {}
  const list = await agent.getKeys({ name: config.issuer_url, sort: 'createdDate', sortDirection: 'DESC' })
  const id = list?.values?.at(0)?.id // use the first returned
  if (id) {
    key = list?.values?.at(0)
  }
  else {
    const data = {
      keyType: 'ECDSA',
      keyParams: {},
      name: config.issuer_url,
      storageType: 'INTERNAL',
      storageParams: {}
    }
    key = await agent.createKey(data)
    console.log('New key: ', key)
  }
  return key?.id
}

async function initDID(url) {
  const listParams = {
    "didMethods[]": 'WEB',
    name: url,
    sort: 'createdDate',
    sortDirection: 'DESC'
  }
  const list = await agent.getDIDs(listParams)
  const id = list?.values?.at(0)?.id // use the first returned
  let identifier, keyId
  if (id) {
    identifier = await agent.getDID(id)
    keyId = identifier?.did?.keys?.assertionMethod?.at(0)?.id
  }
  else {
    keyId = await initKey()
    const data = {
      name: url,
      method: 'WEB',
      keys: {
        authentication: [keyId],
        assertionMethod: [keyId],
        keyAgreement: [keyId],
        capabilityInvocation: [keyId],
        capabilityDelegation: [keyId]
      },
      params: {
        externalHostingUrl: `https://${url}`
      }
    }
    identifier = await agent.createDID(data)
    if (!identifier?.id) {
      throw new Error(`Could not create DID "${url}".`)
    }
  }
  return { id: identifier?.id, did: identifier?.did?.id, keyId }
}

async function initCredentialSchema() {
  const searchParams = {
    name: credentialSchema.name,
    "formats[]": credentialSchema.formats[0].format,
    sort: 'createdDate',
    sortDirection: 'DESC'
  }
  const list = await agent.getCredentialSchemas(searchParams)
  const id = list?.values?.at(0)?.id // use the first returned
  let schema = {}
  if (id) {
    schema = await agent.getCredentialSchema(id)
  }
  else {
    const org = await agent.getOrganization()
    const data = {
      ...credentialSchema,
      organisationId: org.id
    }
    console.log('Creating credential schema with organisationId:', org.id)
    const res = await agent.createCredentialSchema(data)
    if (!res?.id) {
      throw new Error(`Could not create credential schema "${credentialSchema.schemaId}" in organisation ${org.id}.`)
    }
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
  let list = await agent.getCredentialSchemas({ name: credentialSchema.name })
  for (const item of list?.values || []) {
    await agent.deleteCredentialSchema(item.id)
  }
  list = await agent.getVerificationSchemas({ name: credentialSchema.name })
  for (const item of list?.values || []) {
    await agent.deleteVerificationSchema(item.id)
  }
}
