import config from './config.json' with {'type': 'json'}
import credentialSchema from './credentialschema.json' with { type: "json" }
import authData from './auth.js'

// override config file with environment variables
for (const param in config) {
  if (process.env[param] !== undefined) {
    config[param] = process.env[param]
  }
}

const apiHeaders = {
  'Accept': 'application/json',
  'Authorization': `Bearer ${authData.token}`,
  'Content-Type': 'application/json'
}
let org

// let cfg = await api('GET', '/config/v1')
// console.log('Config: ', JSON.stringify(cfg, null, 1))

org = await initOrg()
const key = await initKey()
const did = await initDid()
const schemas = {}
schemas.credential = await initCredentialSchema()
schemas.proof = await initProofSchema()

export { config, api, key, did, schemas }

async function api(method, path, body={}) {
  let url = `${config.api_base}${path}`
  const headers = apiHeaders
  const options = { method, headers }
  if (org) {
    body.organisationId = body.organisationId || org?.at(0).id
  }
  if (method == 'POST') {
    options.body = JSON.stringify(body)
  }
  else {
    body.page = body.page !== undefined ? body.page: 0
    body.pageSize = body.pageSize !== undefined ? body.pageSize: 20
    const queryParams = new URLSearchParams(body)
    url = `${url}?${queryParams.toString()}`
  }
  const resp = await fetch(url, options)
  // console.log(resp.status, method, url, headers, JSON.stringify(body, null, 1))
  if (!resp.ok) {
    console.error(resp.status, method, url, headers, JSON.stringify(body, null, 1))
    console.log(await resp.text())
    return false
  }
  const data = await resp.json()
  // console.log('Response: ', JSON.stringify(data, null, 1))
  return data
}

async function initOrg() {
  return await api('GET', '/organisation/v1')
}

async function initKey() {
  const headers = apiHeaders
  const list = await api('GET', '/key/v1', { name: credentialSchema.name})
  const id = list?.values?.at(0)?.id // use the first returned
  let key = {}
  if (id) {
    // key = await api('GET', `/key/v1/${id}`)
    key = list?.values?.at(0)
  }
  else {
    const body = {
      keyType: 'ECDSA',
      keyParams: {},
      name: credentialSchema.name,
      storageType: 'INTERNAL',
      storageParams: {}
    }
    key = await api('POST', '/key/v1', body)
    console.log(key)
  }
  return key?.id
}

async function initDid() {
  const list = await api('GET', '/did/v1', { name: credentialSchema.name })
  const id = list?.values?.at(0)?.id // use the first returned
  let did = {}
  if (id) {
    did = await api('GET', `/did/v1/${id}`)
  }
  else {
    const body = {
      method: 'WEB',
      name: credentialSchema.name,
      keys: {
        authentication: [key],
        assertionMethod: [key],
        keyAgreement: [key],
        capabilityInvocation: [key],
        capabilityDelegation: [key]
      }
    }
    did = await api('POST', '/did/v1', body)
  }
  return did?.id
}

async function initCredentialSchema() {
  const list = await api('GET', '/credential-schema/v1', { name: credentialSchema.name, format: credentialSchema.format })
  // const list = await api('GET', '/credential-schema/v1', {})
  const id = list?.values?.at(0)?.id // use the first returned
  let schema = {}
  if (id) {
    schema = await api('GET', `/credential-schema/v1/${id}`)
  }
  else {
    schema = await api('POST', '/credential-schema/v1', credentialSchema)
  }
  return schema
}

async function initProofSchema() {
  const list = await api('GET', '/proof-schema/v1', { name: schemas.credential.name })
  const pid = list?.values?.at(0)?.id // use the first returned
  let schema = {}
  if (pid) {
    schema = await api('GET', `/proof-schema/v1/${pid}`)
  }
  else {
    const cs = schemas.credential
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
    schema = await api('POST', '/proof-schema/v1', proofSchema)
  }
  return schema
}
