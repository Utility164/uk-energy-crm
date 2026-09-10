const https = require("https");
const FormData = require("form-data");

const CC_KEY = "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJhdWQiOiIxIiwianRpIjoiYzRhZGNkYmZlODE1N2YzZTZlZDc2OTVkMTE3OTFmMThhMmJmMWJiMTE1ZmZmM2M3NWJkNzE1NWJhMDVlMzg0ODBkOTU1YTBmMmE4Y2JkMGUiLCJpYXQiOjE3ODg3ODAxMjIuODczMTUyLCJuYmYiOjE3ODg3ODAxMjIuODczMTUzLCJleHAiOjQ5NDQ0NTM3MjIuODY0OTA3LCJzdWIiOiI3Njg3ODg1MyIsInNjb3BlcyI6WyJ1c2VyLnJlYWQiLCJ0YXNrLnJlYWQiLCJ0YXNrLndyaXRlIl19.P4E5CZNKfqWcWdc3f9Nj-n3ytNZnud3IfsQciHV2WqaT_5H7GGDMbvNNPRBYkEvuVQ-cTEbsTcvYxdWb6R5dYPMuolwc1dQGphwWqyc6L0nj0IpSkMu-2looQCA2aDW7bU8Q2qui90Dszq_Ljzh5egbyFmi45OXRhtpi2wRKOaBhvSNQfTQjpBmgj7oznMqAn9dq0n0FYhbv8jl3DML97AMSEhFgTXWPiMiWVJtzh3vIY2LQxa1yEDrQ9yi_262g4cYkRbTSMrpPiww46EoGcaOqoIDLUT5hOH1zbD1YW18ihEAn4Mo-KhNVfIcl2v-1d3Ils99jmTLGcxf30K49IYQNsvHY066NCwWtzEeDVDJe_Sw0yfPZMNLqaxdmDfr-8epl1nlYC0Icxh91q0fBaWJ-3adgn0DLnAqlMzBZwv-eKwZwEAAsO23MGQSDQRGqKktTOx89ThhINOEL2GwyzOYs3EDowOvXvpyceoHvzEba-U7UnTrIxVvbrmyIigy0mA7Vaibw3kG33gS2taNcOTa735kIBR49xreqn9kyTswQ9vI3Hnmd-kcqUvo8bIPPWpYgoBanV5gjSpwq74biZE3avbXR1a1AfGijjPzl6XPYCLtFpoiFgHee5IDq0TXXNB-gs6e7zchRPRmFCIrRp37pLE8PQaPOz3N30oipWk8";

const sleep = ms => new Promise(r => setTimeout(r, ms));

const apiReq = (path, method, body, extraHeaders={}) => new Promise((resolve, reject) => {
  const data = body ? JSON.stringify(body) : null;
  const req = https.request({
    hostname: "api.cloudconvert.com",
    path: "/v2" + path,
    method: method || "GET",
    headers: {
      "Authorization": `Bearer ${CC_KEY}`,
      "Content-Type": "application/json",
      ...(data ? {"Content-Length": Buffer.byteLength(data)} : {}),
      ...extraHeaders
    }
  }, res => {
    let d = "";
    res.on("data", c => d += c);
    res.on("end", () => {
      try { resolve({status: res.statusCode, body: JSON.parse(d)}); }
      catch(e) { resolve({status: res.statusCode, body: d}); }
    });
  });
  req.on("error", reject);
  if (data) req.write(data);
  req.end();
});

const downloadUrl = url => new Promise((resolve, reject) => {
  const u = new URL(url);
  https.get({hostname: u.hostname, path: u.pathname + u.search}, res => {
    const chunks = [];
    res.on("data", c => chunks.push(c));
    res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  }).on("error", reject);
});

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  if (event.httpMethod === "OPTIONS") return {statusCode:200, headers, body:""};

  try {
    const {fileBase64, fileName} = JSON.parse(event.body || "{}");
    if (!fileBase64 || !fileName) throw new Error("Missing file data");

    const fileBuffer = Buffer.from(fileBase64, "base64");
    console.log(`File: ${fileName}, ${fileBuffer.length} bytes`);

    // ── STEP 1: Create upload task only (not full job — faster)
    const uploadResp = await apiReq("/tasks", "POST", {
      operation: "import/upload"
    });
    console.log("Upload task:", uploadResp.status, JSON.stringify(uploadResp.body).slice(0,200));
    if (uploadResp.status !== 201) throw new Error("Upload task failed: " + JSON.stringify(uploadResp.body).slice(0,200));

    const uploadTask = uploadResp.body.data;
    const uploadId = uploadTask.id;
    const form = uploadTask.result.form;

    // ── STEP 2: Upload file to S3
    const formData = new FormData();
    Object.entries(form.parameters || {}).forEach(([k,v]) => formData.append(k, v));
    formData.append("file", fileBuffer, {filename: fileName});

    await new Promise((resolve, reject) => {
      const u = new URL(form.url);
      const req = https.request({
        hostname: u.hostname, path: u.pathname + u.search,
        method: "POST", headers: formData.getHeaders()
      }, res => { res.resume(); res.on("end", resolve); });
      req.on("error", reject);
      formData.pipe(req);
    });
    console.log("File uploaded to S3");

    // ── STEP 3: Create convert task
    const convertResp = await apiReq("/tasks", "POST", {
      operation: "convert",
      input: uploadId,
      output_format: "txt",
    });
    console.log("Convert task:", convertResp.status, JSON.stringify(convertResp.body).slice(0,200));
    if (convertResp.status !== 201) throw new Error("Convert task failed: " + JSON.stringify(convertResp.body).slice(0,200));
    const convertId = convertResp.body.data.id;

    // ── STEP 4: Poll convert task (max 25s)
    let convertedOk = false;
    for (let i = 0; i < 12; i++) {
      await sleep(2000);
      const check = await apiReq(`/tasks/${convertId}`);
      const status = check.body.data?.status;
      console.log(`Convert poll ${i+1}: ${status}`);
      if (status === "finished") { convertedOk = true; break; }
      if (status === "error") throw new Error("Convert error: " + JSON.stringify(check.body.data?.message || check.body).slice(0,200));
    }
    if (!convertedOk) throw new Error("Convert timed out");

    // ── STEP 5: Create export task
    const exportResp = await apiReq("/tasks", "POST", {
      operation: "export/url",
      input: convertId,
    });
    console.log("Export task:", exportResp.status);
    if (exportResp.status !== 201) throw new Error("Export task failed: " + JSON.stringify(exportResp.body).slice(0,200));
    const exportId = exportResp.body.data.id;

    // ── STEP 6: Poll export task (max 10s)
    let fileUrl = "";
    for (let i = 0; i < 5; i++) {
      await sleep(1500);
      const check = await apiReq(`/tasks/${exportId}`);
      const status = check.body.data?.status;
      console.log(`Export poll ${i+1}: ${status}`);
      if (status === "finished") {
        fileUrl = check.body.data?.result?.files?.[0]?.url;
        break;
      }
      if (status === "error") throw new Error("Export failed");
    }
    if (!fileUrl) throw new Error("No export URL");

    // ── STEP 7: Download text
    const text = await downloadUrl(fileUrl);
    console.log(`Got ${text.length} chars of text`);

    return {statusCode:200, headers, body: JSON.stringify({text})};

  } catch(e) {
    console.error("ERROR:", e.message);
    return {statusCode:500, headers, body: JSON.stringify({error: e.message})};
  }
};
