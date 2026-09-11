const https = require("https");
const FormData = require("form-data");

const CC_KEY = "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJhdWQiOiIxIiwianRpIjoiYzRhZGNkYmZlODE1N2YzZTZlZDc2OTVkMTE3OTFmMThhMmJmMWJiMTE1ZmZmM2M3NWJkNzE1NWJhMDVlMzg0ODBkOTU1YTBmMmE4Y2JkMGUiLCJpYXQiOjE3ODg3ODAxMjIuODczMTUyLCJuYmYiOjE3ODg3ODAxMjIuODczMTUzLCJleHAiOjQ5NDQ0NTM3MjIuODY0OTA3LCJzdWIiOiI3Njg3ODg1MyIsInNjb3BlcyI6WyJ1c2VyLnJlYWQiLCJ0YXNrLnJlYWQiLCJ0YXNrLndyaXRlIl19.P4E5CZNKfqWcWdc3f9Nj-n3ytNZnud3IfsQciHV2WqaT_5H7GGDMbvNNPRBYkEvuVQ-cTEbsTcvYxdWb6R5dYPMuolwc1dQGphwWqyc6L0nj0IpSkMu-2looQCA2aDW7bU8Q2qui90Dszq_Ljzh5egbyFmi45OXRhtpi2wRKOaBhvSNQfTQjpBmgj7oznMqAn9dq0n0FYhbv8jl3DML97AMSEhFgTXWPiMiWVJtzh3vIY2LQxa1yEDrQ9yi_262g4cYkRbTSMrpPiww46EoGcaOqoIDLUT5hOH1zbD1YW18ihEAn4Mo-KhNVfIcl2v-1d3Ils99jmTLGcxf30K49IYQNsvHY066NCwWtzEeDVDJe_Sw0yfPZMNLqaxdmDfr-8epl1nlYC0Icxh91q0fBaWJ-3adgn0DLnAqlMzBZwv-eKwZwEAAsO23MGQSDQRGqKktTOx89ThhINOEL2GwyzOYs3EDowOvXvpyceoHvzEba-U7UnTrIxVvbrmyIigy0mA7Vaibw3kG33gS2taNcOTa735kIBR49xreqn9kyTswQ9vI3Hnmd-kcqUvo8bIPPWpYgoBanV5gjSpwq74biZE3avbXR1a1AfGijjPzl6XPYCLtFpoiFgHee5IDq0TXXNB-gs6e7zchRPRmFCIrRp37pLE8PQaPOz3N30oipWk8";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

const apiPost = (path, body) => new Promise((resolve, reject) => {
  const data = JSON.stringify(body);
  const req = https.request({
    hostname: "api.cloudconvert.com", path: "/v2" + path, method: "POST",
    headers: {
      "Authorization": `Bearer ${CC_KEY}`,
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(data)
    }
  }, res => {
    let d = ""; res.on("data", c => d += c);
    res.on("end", () => { try { resolve(JSON.parse(d)); } catch(e) { resolve({error: d}); }});
  });
  req.on("error", reject); req.write(data); req.end();
});

const apiGet = path => new Promise((resolve, reject) => {
  const req = https.request({
    hostname: "api.cloudconvert.com", path: "/v2" + path, method: "GET",
    headers: { "Authorization": `Bearer ${CC_KEY}` }
  }, res => {
    let d = ""; res.on("data", c => d += c);
    res.on("end", () => { try { resolve(JSON.parse(d)); } catch(e) { resolve({error: d}); }});
  });
  req.on("error", reject); req.end();
});

const s3Upload = (url, params, fileBuffer, fileName) => new Promise((resolve, reject) => {
  const form = new FormData();
  Object.entries(params).forEach(([k,v]) => form.append(k, v));
  form.append("file", fileBuffer, {filename: fileName});
  const u = new URL(url);
  const req = https.request({
    hostname: u.hostname, path: u.pathname + u.search,
    method: "POST", headers: form.getHeaders()
  }, res => { res.resume(); res.on("end", () => resolve(res.statusCode)); });
  req.on("error", reject);
  form.pipe(req);
});

const download = url => new Promise((resolve, reject) => {
  const u = new URL(url);
  https.get({hostname: u.hostname, path: u.pathname + u.search}, res => {
    const chunks = []; res.on("data", c => chunks.push(c));
    res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  }).on("error", reject);
});

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return {statusCode:200, headers:CORS, body:""};

  try {
    const {fileBase64, fileName} = JSON.parse(event.body||"{}");
    if (!fileBase64||!fileName) throw new Error("Missing file");
    const buf = Buffer.from(fileBase64, "base64");
    console.log(`[convert-doc] ${fileName} ${buf.length}b`);

    // 1. Create full job with synchronous: false
    const jobResp = await apiPost("/jobs", {
      tasks: {
        "upload":  {operation:"import/upload"},
        "convert": {operation:"convert", input:"upload", output_format:"txt"},
        "export":  {operation:"export/url", input:"convert"},
      }
    });
    console.log("[convert-doc] job:", JSON.stringify(jobResp).slice(0,300));

    const job = jobResp.data;
    if (!job) throw new Error("No job data: " + JSON.stringify(jobResp).slice(0,200));

    const tasks = Array.isArray(job.tasks) ? job.tasks : [];
    const uploadTask = tasks.find(t=>t.name==="upload");
    if (!uploadTask?.result?.form) throw new Error("No upload form. Tasks: " + JSON.stringify(tasks.map(t=>({name:t.name,status:t.status}))));

    // 2. Upload to S3
    const sc = await s3Upload(
      uploadTask.result.form.url,
      uploadTask.result.form.parameters,
      buf, fileName
    );
    console.log("[convert-doc] S3 upload status:", sc);

    // 3. Poll job — max 25 polls × 1s = 25s
    for (let i = 0; i < 25; i++) {
      await sleep(1000);
      const status = await apiGet(`/jobs/${job.id}`);
      const jtasks = Array.isArray(status.data?.tasks) ? status.data.tasks : [];
      const exp = jtasks.find(t=>t.name==="export");
      const conv = jtasks.find(t=>t.name==="convert");
      console.log(`[convert-doc] poll ${i+1}: job=${status.data?.status} conv=${conv?.status} exp=${exp?.status}`);

      if (conv?.status==="error") throw new Error("Convert error: "+(conv.message||JSON.stringify(conv).slice(0,200)));
      if (exp?.status==="finished") {
        const fileUrl = exp.result?.files?.[0]?.url;
        if (!fileUrl) throw new Error("No file URL");
        const text = await download(fileUrl);
        console.log("[convert-doc] text length:", text.length);
        return {statusCode:200, headers:CORS, body:JSON.stringify({text})};
      }
      if (status.data?.status==="error") throw new Error("Job error: "+JSON.stringify(status.data).slice(0,200));
    }
    throw new Error("Timed out after 25s");

  } catch(e) {
    console.error("[convert-doc] ERROR:", e.message);
    return {statusCode:500, headers:CORS, body:JSON.stringify({error:e.message})};
  }
};
