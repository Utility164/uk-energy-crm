const https = require("https");
const FormData = require("form-data");

const CC_KEY = "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJhdWQiOiIxIiwianRpIjoiYzRhZGNkYmZlODE1N2YzZTZlZDc2OTVkMTE3OTFmMThhMmJmMWJiMTE1ZmZmM2M3NWJkNzE1NWJhMDVlMzg0ODBkOTU1YTBmMmE4Y2JkMGUiLCJpYXQiOjE3ODg3ODAxMjIuODczMTUyLCJuYmYiOjE3ODg3ODAxMjIuODczMTUzLCJleHAiOjQ5NDQ0NTM3MjIuODY0OTA3LCJzdWIiOiI3Njg3ODg1MyIsInNjb3BlcyI6WyJ1c2VyLnJlYWQiLCJ0YXNrLnJlYWQiLCJ0YXNrLndyaXRlIl19.P4E5CZNKfqWcWdc3f9Nj-n3ytNZnud3IfsQciHV2WqaT_5H7GGDMbvNNPRBYkEvuVQ-cTEbsTcvYxdWb6R5dYPMuolwc1dQGphwWqyc6L0nj0IpSkMu-2looQCA2aDW7bU8Q2qui90Dszq_Ljzh5egbyFmi45OXRhtpi2wRKOaBhvSNQfTQjpBmgj7oznMqAn9dq0n0FYhbv8jl3DML97AMSEhFgTXWPiMiWVJtzh3vIY2LQxa1yEDrQ9yi_262g4cYkRbTSMrpPiww46EoGcaOqoIDLUT5hOH1zbD1YW18ihEAn4Mo-KhNVfIcl2v-1d3Ils99jmTLGcxf30K49IYQNsvHY066NCwWtzEeDVDJe_Sw0yfPZMNLqaxdmDfr-8epl1nlYC0Icxh91q0fBaWJ-3adgn0DLnAqlMzBZwv-eKwZwEAAsO23MGQSDQRGqKktTOx89ThhINOEL2GwyzOYs3EDowOvXvpyceoHvzEba-U7UnTrIxVvbrmyIigy0mA7Vaibw3kG33gS2taNcOTa735kIBR49xreqn9kyTswQ9vI3Hnmd-kcqUvo8bIPPWpYgoBanV5gjSpwq74biZE3avbXR1a1AfGijjPzl6XPYCLtFpoiFgHee5IDq0TXXNB-gs6e7zchRPRmFCIrRp37pLE8PQaPOz3N30oipWk8";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// POST to CloudConvert API
const ccPost = (path, body) => new Promise((resolve, reject) => {
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
    res.on("end", () => { try { resolve(JSON.parse(d)); } catch(e) { resolve({_raw: d}); }});
  });
  req.on("error", reject); req.write(data); req.end();
});

// Upload file to S3
const s3Upload = (url, params, buf, name) => new Promise((resolve, reject) => {
  const form = new FormData();
  Object.entries(params||{}).forEach(([k,v]) => form.append(k,v));
  form.append("file", buf, {filename: name});
  const u = new URL(url);
  const req = https.request({
    hostname: u.hostname, path: u.pathname+u.search,
    method: "POST", headers: form.getHeaders()
  }, res => { res.resume(); res.on("end", () => resolve(res.statusCode)); });
  req.on("error", reject);
  form.pipe(req);
});

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return {statusCode:200, headers:CORS, body:""};

  try {
    const {fileBase64, fileName} = JSON.parse(event.body||"{}");
    if (!fileBase64||!fileName) throw new Error("Missing file");
    const buf = Buffer.from(fileBase64, "base64");

    // STEP 1: Create job (just upload + convert + export tasks)
    const jobResp = await ccPost("/jobs", {
      tasks: {
        "upload":  {operation:"import/upload"},
        "convert": {operation:"convert", input:"upload", output_format:"txt"},
        "export":  {operation:"export/url", input:"convert"},
      }
    });

    const job = jobResp.data;
    if (!job?.id) throw new Error("Job creation failed: " + JSON.stringify(jobResp).slice(0,300));

    const tasks = Array.isArray(job.tasks) ? job.tasks : [];
    const uploadTask = tasks.find(t=>t.name==="upload");
    if (!uploadTask?.result?.form) throw new Error("No upload form in job response");

    // STEP 2: Upload file to S3
    await s3Upload(
      uploadTask.result.form.url,
      uploadTask.result.form.parameters,
      buf, fileName
    );

    // Return job ID to browser — browser will poll CloudConvert directly
    return {
      statusCode: 200, headers: CORS,
      body: JSON.stringify({
        jobId: job.id,
        apiKey: CC_KEY,  // safe — browser will use it to poll only
      })
    };

  } catch(e) {
    console.error("[convert-doc]", e.message);
    return {statusCode:500, headers:CORS, body:JSON.stringify({error:e.message})};
  }
};
