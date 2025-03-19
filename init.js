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

const key = await initKey()
const did = await initDid()
const schemas = {}
schemas.credential = await initCredentialSchema()
schemas.proof = await initProofSchema()

export { config, apiHeaders, key, did, schemas }

async function initKey() {
  const headers = apiHeaders
  const listUrl =  `${config.api_base}/key/v1?name=${encodeURIComponent(credentialSchema.name)}`
  const resp = await fetch(listUrl, { headers })
  if (resp.status != 200) {
    console.error(resp.status, listUrl, headers)
    console.log(await resp.text())
    return false
  }
  const results = await resp.json()
  // console.log(results)
  const id = results?.values?.at(0)?.id // use the first returned
  if (id) {
    const getUrl = `${config.api_base}/key/v1/${id}`
    const getResp = await fetch(getUrl, { headers })
    if (getResp.status == 200) {
      const getJson = await getResp.json()
      // console.log(getJson)
      return getJson.id
    }
  }
  else {
    const createUrl =  `${config.api_base}/key/v1`
    const body = JSON.stringify({
      keyType: 'ES256',
      keyParams: {},
      name: credentialSchema.name,
      storageType: 'INTERNAL',
      storageParams: {}
    })
    const createResp = await fetch(createUrl, { method: 'POST', headers, body })
    if (createResp.status != 201) {
      console.error(createResp.status, createUrl, headers, body)
      console.log(await createResp.text())
      return false
    }
    const createJson = await createResp.json()
    console.log(`Created new key ${createJson.id}`)
    // console.log(createJson)
    return createJson.id    
  }
}

async function initDid() {
  const headers = apiHeaders
  const listUrl =  `${config.api_base}/did/v1?name=${encodeURIComponent(credentialSchema.name)}`
  const resp = await fetch(listUrl, { headers })
  if (resp.status != 200) {
    console.error(resp.status, listUrl, headers)
    console.log(await resp.text())
    return false
  }
  const results = await resp.json()
  const id = results?.values?.at(0)?.id // use the first returned
  if (id) {
    const getUrl = `${config.api_base}/did/v1/${id}`
    const getResp = await fetch(getUrl, { headers })
    if (getResp.status == 200) {
      const getJson = await getResp.json()
      // console.log(getJson)
      return getJson.id
    }
  }
  else {
    const createUrl =  `${config.api_base}/did/v1`
    const body = JSON.stringify({
      method: 'WEB',
      name: credentialSchema.name,
      keys: {
        authentication: [key],
        assertionMethod: [key],
        keyAgreement: [key],
        capabilityInvocation: [key],
        capabilityDelegation: [key]
      }
    })
    const createResp = await fetch(createUrl, { method: 'POST', headers, body })
    if (createResp.status != 201) {
      console.error(createResp.status, createUrl, headers, body)
      console.log(await createResp.text())
      return false
    }
    const createJson = await createResp.json()
    console.log(`Created new did ${createJson.id}`)
    // console.log(createJson)
    return createJson.id
  }
}

async function initCredentialSchema() {
  const headers = apiHeaders
  const queryParams = new URLSearchParams({
    name: credentialSchema.name,
    format: credentialSchema.format
  })
  const listUrl =  `${config.api_base}/credential-schema/v1?${queryParams.toString()}`
  const resp = await fetch(listUrl, { headers })
  if (resp.status != 200) {
    console.error(resp.status, listUrl, headers)
    console.log(await resp.text())
    return false
  }
  const results = await resp.json()
  const id = results?.values?.at(0)?.id // use the first returned
  if (id) {
    const getUrl = `${config.api_base}/credential-schema/v1/${id}`
    const getResp = await fetch(getUrl, { headers })
    if (getResp.status == 200) {
      const getJson = await getResp.json()
      // console.log(getJson)
      return getJson
    }
  }
  else {
    const createUrl =  `${config.api_base}/credential-schema/v1`
    const body = JSON.stringify(credentialSchema)
    const createResp = await fetch(createUrl, { method: 'POST', headers, body })
    if (createResp.status != 201) {
      console.error(createResp.status, createUrl, headers, body)
      console.log(await createResp.text())
      return false
    }
    const createJson = await createResp.json()
    console.log(`Created new credential schema ${createJson.id}`)
    // console.log(createJson)
    return createJson
  }
}

async function initProofSchema() {
  const headers = apiHeaders
  const listUrl =  `${config.api_base}/proof-schema/v1?name=${encodeURIComponent(credentialSchema.name)}`
  // const listUrl =  `${config.api_base}/proof-schema/v1`
  const resp = await fetch(listUrl, { headers })
  if (resp.status != 200) {
    console.error(resp.status, listUrl, headers)
    console.log(await resp.text())
    return false
  }
  const results = await resp.json()
  // console.log(JSON.stringify(results, null, 1))
  const id = results?.values?.at(0)?.id // use the first returned
  if (id) {
    const getUrl = `${config.api_base}/proof-schema/v1/${id}`
    const getResp = await fetch(getUrl, { headers })
    if (getResp.status == 200) {
      const getJson = await getResp.json()
      // console.log(getJson)
      return getJson
    }
  }
  else {
    const createUrl =  `${config.api_base}/proof-schema/v1`
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
          else {
            console.warn(child.key)
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
          else {
            console.warn(child.key)
          }
        })
      }
    })
    const body = JSON.stringify(proofSchema)
    const createResp = await fetch(createUrl, { method: 'POST', headers, body })
    if (createResp.status != 201) {
      console.error(createResp.status, createUrl, headers, body)
      console.log(await createResp.text())
      return false
    }
    const createJson = await createResp.json()
    console.log(`Created new proof schema ${createJson.id}`)
    // console.log(createJson)
    return createJson
  }
}
