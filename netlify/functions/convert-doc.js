const https = require("https");
const FormData = require("form-data");

const CC_KEY = "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJhdWQiOiIxIiwianRpIjoiYzRhZGNkYmZlODE1N2YzZTZlZDc2OTVkMTE3OTFmMThhMmJmMWJiMTE1ZmZmM2M3NWJkNzE1NWJhMDVlMzg0ODBkOTU1YTBmMmE4Y2JkMGUiLCJpYXQiOjE3ODg3ODAxMjIuODczMTUyLCJuYmYiOjE3ODg3ODAxMjIuODczMTUzLCJleHAiOjQ5NDQ0NTM3MjIuODY0OTA3LCJzdWIiOiI3Njg3ODg1MyIsInNjb3BlcyI6WyJ1c2VyLnJlYWQiLCJ0YXNrLnJlYWQiLCJ0YXNrLndyaXRlIl19.P4E5CZNKfqWcWdc3f9Nj-n3ytNZnud3IfsQciHV2WqaT_5H7GGDMbvNNPRBYkEvuVQ-cTEbsTcvYxdWb6R5dYPMuolwc1dQGphwWqyc6L0nj0IpSkMu-2looQCA2aDW7bU8Q2qui90Dszq_Ljzh5egbyFmi45OXRhtpi2wRKOaBhvSNQfTQjpBmgj7oznMqAn9dq0n0FYhbv8jl3DML97AMSEhFgTXWPiMiWVJtzh3vIY2LQxa1yEDrQ9yi_262g4cYkRbTSMrpPiww46EoGcaOqoIDLUT5hOH1zbD1YW18ihEAn4Mo-KhNVfIcl2v-1d3Ils99jmTLGcxf30K49IYQNsvHY066NCwWtzEeDVDJe_Sw0yfPZMNLqaxdmDfr-8epl1nlYC0Icxh91q0fBaWJ-3adgn0DLnAqlMzBZwv-eKwZwEAAsO23MGQSDQRGqKktTOx89ThhINOEL2GwyzOYs3EDowOvXvpyceoHvzEba-U7UnTrIxVvbrmyIigy0mA7Vaibw3kG33gS2taNcOTa735kIBR49xreqn9kyTswQ9vI3Hnmd-kcqUvo8bIPPWpYgoBanV5gjSpwq74biZE3avbXR1a1AfGijjPzl6XPYCLtFpoiFgHee5IDq0TXXNB-gs6e7zchRPRmFCIrRp37pLE8PQaPOz3N30oipWk8";

const sleep = ms => new Promise(r => setTimeout(r, ms));

const ccFetch = (path, method="GET", body=null) => new Promise((resolve, reject) => {
  const opts = {
    hostname: "api.cloudconvert.com",
    path: "/v2" + path,
    method,
    headers: {
      "Authorization": `Bearer ${CC_KEY}`,
      "Content-Type": "application/json",
    }
  };
  const req = https.request(opts, res => {
    let data = "";
    res.on("data", c => data += c);
    res.on("end", () => {
      try { resolve(JSON.parse(data)); }
      catch(e) { reject(new Error("Invalid JSON: " + data.slice(0,200))); }
    });
  });
  req.on("error", reject);
  if (body) req.write(JSON.stringify(body));
  req.end();
});

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers, body: "Method not allowed" };

  try {
    // Parse multipart body — file is sent as base64
    const body = JSON.parse(event.body || "{}");
    const { fileBase64, fileName } = body;
    if (!fileBase64 || !fileName) throw new Error("Missing fileBase64 or fileName");

    const fileBuffer = Buffer.from(fileBase64, "base64");

    // 1. Create job
    const job = await ccFetch("/jobs", "POST", {
      tasks: {
        "upload-file":   { operation: "import/upload" },
        "convert-file":  { operation: "convert", input: "upload-file", output_format: "txt" },
        "export-result": { operation: "export/url", input: "convert-file" },
      }
    });

    const tasks = job.data?.tasks || [];
    const uploadTask = tasks.find(t => t.name === "upload-file");
    if (!uploadTask) throw new Error("No upload task: " + JSON.stringify(job).slice(0,300));

    // 2. Upload file via multipart form
    const form = uploadTask.result.form;
    const formData = new FormData();
    Object.entries(form.parameters || {}).forEach(([k,v]) => formData.append(k, v));
    formData.append("file", fileBuffer, { filename: fileName });

    await new Promise((resolve, reject) => {
      const uploadUrl = new URL(form.url);
      const req = https.request({
        hostname: uploadUrl.hostname,
        path: uploadUrl.pathname + uploadUrl.search,
        method: "POST",
        headers: formData.getHeaders(),
      }, res => { res.on("data",()=>{}); res.on("end", resolve); });
      req.on("error", reject);
      formData.pipe(req);
    });

    // 3. Poll for result
    const jobId = job.data.id;
    let text = "";
    for (let i = 0; i < 20; i++) {
      await sleep(2000);
      const status = await ccFetch(`/jobs/${jobId}`);
      const sTasks = status.data?.tasks || [];
      const exportTask = sTasks.find(t => t.name === "export-result");
      if (exportTask?.status === "finished") {
        const fileUrl = exportTask.result?.files?.[0]?.url;
        if (!fileUrl) throw new Error("No file URL in export result");
        // Download converted text
        text = await new Promise((resolve, reject) => {
          const u = new URL(fileUrl);
          https.get({ hostname: u.hostname, path: u.pathname + u.search }, res => {
            let d = "";
            res.on("data", c => d += c);
            res.on("end", () => resolve(d));
          }).on("error", reject);
        });
        break;
      }
      if (status.data?.status === "error") throw new Error("CloudConvert conversion failed");
    }

    if (!text) throw new Error("Conversion timed out");
    return { statusCode: 200, headers, body: JSON.stringify({ text }) };

  } catch(e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
