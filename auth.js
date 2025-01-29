import config from './config.json' with {'type': 'json'}

const MAX_TTL = Math.pow(2, 31) -1 // setTimeout accepts max 32 bit integers
const myHeaders = new Headers();
myHeaders.append("Content-Type", "application/json");
myHeaders.append("Accept", "application/json");

async function login() {
  const authOptions = {
    method: "POST",
    headers: myHeaders,
    body: JSON.stringify({
      "email": config.email,
      "password": config.password,
      "method": "PASSWORD",
      "stayLoggedIn": true
    })
  }
  const response = await fetch(`${config.api_base}/auth/v1/login`, authOptions)
  if (response.status != 201) {
    console.error(response.status, `${config.api_base}/auth/v1/login`)
    console.log(JSON.stringify(authOptions, null, 1))
    console.log(JSON.stringify(await response.json(), null, 1))
    return false
  }
  const json = await response.json()
  // console.log(JSON.stringify(json, null, 1))
  const token = json.token
  if (!token) {
    throw new Error('Login failed!')
    return false
  }
  myHeaders.append("Authorization", `Bearer ${token}`)
  const exp = json?.refreshExpiresIn
  if (exp) {
    const ttl = Math.min(new Date(exp).getTime() - new Date().getTime(), MAX_TTL)
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
    headers: myHeaders,
    redirect: "follow"
  }
  const response = await fetch(`${config.api_base}/auth/v1/refresh`, refreshOptions)
  if (response.status != 201) {
    console.error(response.status, `${config.api_base}/auth/v1/refresh`)
    console.log(JSON.stringify(refreshOptions, null, 1))
    console.log(JSON.stringify(await response.json(), null, 1))
    return false
  }
  const json = await response.json()
  const token = json.token
  if (!token) {
    throw new Error('Auth refresh failed!')
  }
  myHeaders.set("Authorization", `Bearer ${token}`)
  const exp = json?.refreshExpiresIn
  if (exp) {
    const ttl = Math.min(new Date(exp).getTime() - new Date().getTime(), MAX_TTL)
    if (exp) {
      setTimeout(authRefresh, ttl)
    }
  }
  // console.log(`Got access token: ${token}`)
  return json
}

export default await login()

