// Kraken Futures: ondertekenen van privé-verzoeken (alleen lezen).
// De sleutels blijven in de app-schil; de webapp krijgt ze nooit te zien.
const crypto = require("crypto");

const BASE = "https://futures.kraken.com";

// Alleen deze GET-verzoeken zijn toegestaan: saldo, posities, orders en fills bekijken.
// Orders plaatsen, wijzigen of geld opnemen kan via deze code niet.
const READ_ENDPOINTS = {
  accounts: "/derivatives/api/v3/accounts",
  openpositions: "/derivatives/api/v3/openpositions",
  openorders: "/derivatives/api/v3/openorders",
  fills: "/derivatives/api/v3/fills",
};

// Authent = base64( HMAC-SHA512( base64decode(secret), SHA256(postData + nonce + endpoint) ) )
// waarbij endpoint het pad zonder "/derivatives" is (volgens de Kraken Futures-documentatie).
function sign(path, postData, nonce, secretB64) {
  const endpoint = path.startsWith("/derivatives") ? path.slice("/derivatives".length) : path;
  const hash = crypto.createHash("sha256").update(postData + nonce + endpoint, "utf8").digest();
  return crypto.createHmac("sha512", Buffer.from(secretB64, "base64")).update(hash).digest("base64");
}

let lastNonce = 0;
function nextNonce() {
  lastNonce = Math.max(Date.now(), lastNonce + 1);
  return String(lastNonce);
}

function authHeaders(path, query, creds, nonce = nextNonce()) {
  return { APIKey: creds.key, Nonce: nonce, Authent: sign(path, query || "", nonce, creds.secret) };
}

function checkCreds(key, secret) {
  key = String(key || "").trim();
  secret = String(secret || "").trim();
  if (key.length < 20 || /\s/.test(key)) throw new Error("De public key lijkt niet te kloppen. Kopieer hem opnieuw uit Kraken.");
  if (secret.length < 40 || !/^[A-Za-z0-9+/]+=*$/.test(secret)) throw new Error("De private key lijkt niet te kloppen. Kopieer hem opnieuw uit Kraken.");
  return { key, secret };
}

const ERRORS = {
  authenticationError: "Kraken accepteert de key niet. Controleer de public en private key (en of de key niet verwijderd is).",
  apiLimitExceeded: "Te veel verzoeken naar Kraken. Probeer het over een minuut opnieuw.",
  nonceBelowThreshold: "Kraken weigerde het verzoek (nonce). Probeer het opnieuw.",
  nonceDuplicate: "Kraken weigerde het verzoek (nonce). Probeer het opnieuw.",
};
function errorText(code, status) {
  return ERRORS[code] || (code ? `Kraken gaf een fout: ${code}.` : `Kraken is niet bereikbaar (${status}).`);
}

// "abcd…wxyz": genoeg om de key te herkennen, niet om hem te gebruiken.
const hint = (key) => (key && key.length > 8 ? `${key.slice(0, 4)}…${key.slice(-4)}` : "");

module.exports = { BASE, READ_ENDPOINTS, sign, nextNonce, authHeaders, checkCreds, errorText, hint };
