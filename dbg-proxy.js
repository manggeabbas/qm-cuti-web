const { ProxyAgent } = require("undici");
const d = new ProxyAgent(process.env.HTTPS_PROXY);
console.log("agent dibuat, proxy=", process.env.HTTPS_PROXY);
fetch("https://api.telegram.org/", { dispatcher: d, signal: AbortSignal.timeout(15000) })
  .then(r => console.log("status:", r.status))
  .catch(e => { console.log("ERR:", e.message); console.log("CAUSE:", e.cause && (e.cause.code || e.cause.message)); });
