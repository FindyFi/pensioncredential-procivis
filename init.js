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
  'Authorization': `Bearer ${authData.access_token}`,
  'Content-Type': 'application/json'
}
// let cfg = await api('GET', '/config/v1')
// console.log('Config: ', JSON.stringify(cfg, null, 1))

let org
org = await initOrg()
const key = await initKey()
const did = await initDid()

// await clearSchemas()
const schemas = {}
schemas.credential = await initCredentialSchema()
schemas.proof = await initProofSchema()

export { config, api, key, did, schemas }

async function api(method, path, body={}) {
  let url = `${config.api_base}${path}`
  const headers = apiHeaders
  const options = { method, headers }
  if (org) {
    body.organisationId = body.organisationId || org?.id
  }
  if (method == 'POST' || method == 'PATCH' || method == 'PUT') {
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
  let data
  if (resp.headers.get('Content-Type')?.includes('application/json')) {
    data = await resp.json()
  }
  else {
    data = await resp.text()
  }
  if (data.totalPages > body.page + 1) {
    body.page++
    const nextPageData = await api(method, path, body)
    if (nextPageData && nextPageData.values) {
      data.values = data.values.concat(nextPageData.values)
    }
  }
  // console.log('Response: ', JSON.stringify(data, null, 1))
  return data
}

async function initOrg() {
  const list = await api('GET', '/organisation/v1')
  return list[0] // use the first returned
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
    console.log('New key: ', key)
  }
  return key?.id
}

async function initDid() {
  const listParams = {
    "didMethods[]": 'WEB',
    name: config.issuer_url,
    sort: 'createdDate',
    sortDirection: 'DESC' }
  const list = await api('GET', '/identifier/v1', listParams)
  // const list = await api('GET', '/did/v1', { })
  const id = list?.values?.at(0)?.id // use the first returned
  if (id) {
    const identifier = await api('GET', `/identifier/v1/${id}`)
    // console.log(JSON.stringify(identifier, null, 2))
    return identifier?.did?.id
  }
  else {
    const body = {
      name: config.issuer_url,
      did: {
        method: 'WEB',
        name: config.issuer_url,
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
    }
    const identifier = await api('POST', '/identifier/v1', body)
    return identifier?.did?.id
  }
}

async function initCredentialSchema() {
  const list = await api('GET', '/credential-schema/v1', { name: credentialSchema.name, format: credentialSchema.format })
  const id = list?.values?.at(0)?.id // use the first returned
  let schema = {}
  if (id) {
    schema = await api('GET', `/credential-schema/v1/${id}`)
  }
  else {
    const res = await api('POST', '/credential-schema/v1', credentialSchema)
    schema = await api('GET', `/credential-schema/v1/${res.id}`)
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

async function clearSchemas() {
  let list = await api('GET', '/credential-schema/v1', {})
  for (const item of list?.values || []) {
    await api('DELETE', `/credential-schema/v1/${item.id}`)
  }
  list = await api('GET', '/proof-schema/v1', {})
  for (const item of list?.values || []) {
    await api('DELETE', `/proof-schema/v1/${item.id}`)
  }
}
