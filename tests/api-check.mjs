import { Readable } from "node:stream";
import handler from "../api/clip/[id].js";

function createReq({ method, id, body = "", ip = "127.0.0.1" }) {
  const req = Readable.from(body ? [body] : []);
  req.method = method;
  req.query = { id };
  req.headers = {
    "x-forwarded-for": ip
  };
  req.socket = { remoteAddress: ip };
  return req;
}

function createRes() {
  return {
    statusCode: 200,
    headers: {},
    body: "",
    setHeader(key, value) {
      this.headers[key.toLowerCase()] = value;
    },
    end(value = "") {
      this.body = value;
      this.finished = true;
    }
  };
}

async function invoke(options) {
  const req = createReq(options);
  const res = createRes();
  await handler(req, res);
  return {
    status: res.statusCode,
    headers: res.headers,
    body: res.body ? JSON.parse(res.body) : null
  };
}

const id = `api-check-${Date.now()}`;
const invalid = await invoke({
  method: "PUT",
  id,
  body: JSON.stringify({ version: 2, id, payload: { clips: [] } })
});
if (invalid.status !== 400) {
  throw new Error(`Expected plaintext payload rejection, received ${invalid.status}.`);
}

const encryptedRecord = {
  version: 2,
  id,
  updatedAt: new Date().toISOString(),
  sync: { mode: "link", salt: "AAAAAAAAAAAAAAAAAAAAAA==" },
  encryptedPayload: {
    iv: "AAAAAAAAAAAAAAAA",
    data: "ciphertext"
  }
};

const saved = await invoke({
  method: "PUT",
  id,
  body: JSON.stringify(encryptedRecord)
});
if (saved.status !== 200 || saved.body.ok !== true) {
  throw new Error(`Expected encrypted payload save, received ${saved.status}.`);
}

const fetched = await invoke({ method: "GET", id });
if (fetched.status !== 200 || fetched.body.id !== id || !fetched.body.encryptedPayload) {
  throw new Error(`Expected encrypted payload fetch, received ${fetched.status}.`);
}

const badId = await invoke({ method: "GET", id: "../etc/passwd" });
if (badId.status !== 400) {
  throw new Error(`Expected invalid id rejection, received ${badId.status}.`);
}

console.log("API checks passed.");
