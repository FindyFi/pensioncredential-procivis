import config from './config.json' with {'type': 'json'}

const MAX_TTL = Math.pow(2, 31) -1 // setTimeout accepts max 32 bit integers
const myHeaders = new Headers()
myHeaders.append("Content-Type", "application/json")
myHeaders.append("Accept", "application/json")

let refreshToken = null

async function login() {
  if (config.api_token) {
    myHeaders.append("Authorization", `Bearer ${config.api_token}`)
    return {
      token: config.api_token,
    }
  }
  const query = new URLSearchParams()
  query.append("client_id", config.client_id)
  query.append("client_secret", config.client_secret)
  query.append("grant_type", "client_credentials")
  const response = await fetch(config.token_endpoint, {method: "POST", body: query})
  if (!response.ok) {
    console.error(response.status, config.token_endpoint)
    console.log(query.toString())
    console.log(JSON.stringify(await response.json(), null, 1))
    return false
  }
  const json = await response.json()
  // console.log(JSON.stringify(json, null, 1))
  const token = json.access_token
  if (!token) {
    throw new Error('Login failed!')
    return false
  }
  myHeaders.append("Authorization", `Bearer ${token}`)
  const exp = json?.expires_in
  if (exp) {
    const ttl = Math.min(new Date().getTime() + exp * 1000, MAX_TTL)
    console.log(`Refreshing token in ${ttl/1000/3600} hours.`)
    if (exp) {
      setTimeout(authRefresh, ttl)
    }
  }
  // console.log(`Got access token: ${token}`)
  return json
}

async function authRefresh() {
  const refreshOptions = {
    method: "POST",
    body: JSON.stringify({
      "client_id": config.client_id,
      "refresh_token": refreshToken,
      "grant_type": "refresh_token"
    })
  }
  const response = await fetch(config.token_endpoint, refreshOptions)
  if (!response.ok) {
    console.error(response.status, config.token_endpoint)
    console.log(JSON.stringify(refreshOptions, null, 1))
    console.log(JSON.stringify(await response.json(), null, 1))
    return false
  }
  const json = await response.json()
  const token = json.access_token
  refreshToken = json.refresh_token
  if (!token) {
    throw new Error('Auth refresh failed!')
  }
  myHeaders.set("Authorization", `Bearer ${token}`)
  const exp = json?.expires_in
  if (exp) {
    const ttl = Math.min(new Date().getTime() + exp * 1000, MAX_TTL)
    if (exp) {
      setTimeout(authRefresh, ttl)
    }
  }
  // console.log(`Got access token: ${token}`)
  return json
}

export default await login()

