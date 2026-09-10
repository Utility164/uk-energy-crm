const https = require("https");
const FormData = require("form-data");

const CC_KEY = "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJhdWQiOiIxIiwianRpIjoiYzRhZGNkYmZlODE1N2YzZTZlZDc2OTVkMTE3OTFmMThhMmJmMWJiMTE1ZmZmM2M3NWJkNzE1NWJhMDVlMzg0ODBkOTU1YTBmMmE4Y2JkMGUiLCJpYXQiOjE3ODg3ODAxMjIuODczMTUyLCJuYmYiOjE3ODg3ODAxMjIuODczMTUzLCJleHAiOjQ5NDQ0NTM3MjIuODY0OTA3LCJzdWIiOiI3Njg3ODg1MyIsInNjb3BlcyI6WyJ1c2VyLnJlYWQiLCJ0YXNrLnJlYWQiLCJ0YXNrLndyaXRlIl19.P4E5CZNKfqWcWdc3f9Nj-n3ytNZnud3IfsQciHV2WqaT_5H7GGDMbvNNPRBYkEvuVQ-cTEbsTcvYxdWb6R5dYPMuolwc1dQGphwWqyc6L0nj0IpSkMu-2looQCA2aDW7bU8Q2qui90Dszq_Ljzh5egbyFmi45OXRhtpi2wRKOaBhvSNQfTQjpBmgj7oznMqAn9dq0n0FYhbv8jl3DML97AMSEhFgTXWPiMiWVJtzh3vIY2LQxa1yEDrQ9yi_262g4cYkRbTSMrpPiww46EoGcaOqoIDLUT5hOH1zbD1YW18ihEAn4Mo-KhNVfIcl2v-1d3Ils99jmTLGcxf30K49IYQNsvHY066NCwWtzEeDVDJe_Sw0yfPZMNLqaxdmDfr-8epl1nlYC0Icxh91q0fBaWJ-3adgn0DLnAqlMzBZwv-eKwZwEAAsO23MGQSDQRGqKktTOx89ThhINOEL2GwyzOYs3EDowOvXvpyceoHvzEba-U7UnTrIxVvbrmyIigy0mA7Vaibw3kG33gS2taNcOTa735kIBR49xreqn9kyTswQ9vI3Hnmd-kcqUvo8bIPPWpYgoBanV5gjSpwq74biZE3avbXR1a1AfGijjPzl6XPYCLtFpoiFgHee5IDq0TXXNB-gs6e7zchRPRmFCIrRp37pLE8PQaPOz3N30oipWk8";

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Generic HTTPS request helper
const httpsReq = (url, method="GET", body=null, extraHeaders={}) => new Promise((resolve, reject) => {
  const u = new URL(url);
  const opts = {
    hostname: u.hostname,
    path: u.pathname + u.search,
    method,
    headers: {
      "Content-Type": "application/json",
      ...extraHeaders
    }
  };
  const req = https.request(opts, res => {
    let data = "";
    res.on("data", c => data += c);
    res.on("end", () => {
      console.log(`[${method}] ${url} → ${res.statusCode}: ${data.slice(0,300)}`);
      try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
      catch(e) { resolve({ status: res.statusCode, body: data }); }
    });
  });
  req.on("error", reject);
  if (body) req.write(typeof body === "string" ? body : JSON.stringify(body));
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
    const body = JSON.parse(event.body || "{}");
    const { fileBase64, fileName } = body;
    if (!fileBase64 || !fileName) throw new Error("Missing fileBase64 or fileName");

    const fileBuffer = Buffer.from(fileBase64, "base64");
    console.log(`Processing: ${fileName}, size: ${fileBuffer.length} bytes`);

    // Step 1: Create CloudConvert job
    const jobResp = await httpsReq(
      "https://api.cloudconvert.com/v2/jobs",
      "POST",
      {
        tasks: {
          "upload-file":   { operation: "import/upload" },
          "convert-file":  { operation: "convert", input: "upload-file", output_format: "txt" },
          "export-result": { operation: "export/url", input: "convert-file" },
        }
      },
      { "Authorization": `Bearer ${CC_KEY}` }
    );

    console.log("Job response status:", jobResp.status);
    console.log("Job response body:", JSON.stringify(jobResp.body).slice(0, 500));

    if (jobResp.status !== 201 && jobResp.status !== 200) {
      throw new Error(`CloudConvert job creation failed (${jobResp.status}): ${JSON.stringify(jobResp.body).slice(0,300)}`);
    }

    const jobData = jobResp.body.data || jobResp.body;
    const tasks = Array.isArray(jobData.tasks) ? jobData.tasks : Object.values(jobData.tasks || {});
    console.log("Tasks found:", tasks.map(t => t.name || t.operation));

    const uploadTask = tasks.find(t => t.name === "upload-file");
    if (!uploadTask) throw new Error(`No upload task found. Tasks: ${JSON.stringify(tasks).slice(0,300)}`);
    if (!uploadTask.result?.form) throw new Error(`Upload task has no form yet. Status: ${uploadTask.status}`);

    // Step 2: Upload file
    const form = uploadTask.result.form;
    console.log("Upload URL:", form.url);

    const formData = new FormData();
    Object.entries(form.parameters || {}).forEach(([k, v]) => formData.append(k, v));
    formData.append("file", fileBuffer, { filename: fileName });

    await new Promise((resolve, reject) => {
      const uploadUrl = new URL(form.url);
      const req = https.request({
        hostname: uploadUrl.hostname,
        path: uploadUrl.pathname + uploadUrl.search,
        method: "POST",
        headers: formData.getHeaders(),
      }, res => {
        let d = "";
        res.on("data", c => d += c);
        res.on("end", () => {
          console.log(`Upload response: ${res.statusCode} ${d.slice(0,200)}`);
          resolve();
        });
      });
      req.on("error", reject);
      formData.pipe(req);
    });

    // Step 3: Poll for result
    const jobId = jobData.id;
    console.log("Polling job:", jobId);

    let text = "";
    for (let i = 0; i < 20; i++) {
      await sleep(2000);
      const statusResp = await httpsReq(
        `https://api.cloudconvert.com/v2/jobs/${jobId}`,
        "GET", null,
        { "Authorization": `Bearer ${CC_KEY}` }
      );

      const statusData = statusResp.body.data || statusResp.body;
      const sTasks = Array.isArray(statusData.tasks) ? statusData.tasks : Object.values(statusData.tasks || {});
      const exportTask = sTasks.find(t => t.name === "export-result");
      const convertTask = sTasks.find(t => t.name === "convert-file");

      console.log(`Poll ${i+1}: job=${statusData.status}, convert=${convertTask?.status}, export=${exportTask?.status}`);

      if (convertTask?.status === "error") {
        throw new Error(`Conversion error: ${JSON.stringify(convertTask.message || convertTask).slice(0,300)}`);
      }

      if (exportTask?.status === "finished") {
        const fileUrl = exportTask.result?.files?.[0]?.url;
        if (!fileUrl) throw new Error("No file URL in export result");

        // Download text
        text = await new Promise((resolve, reject) => {
          const u = new URL(fileUrl);
          https.get({
            hostname: u.hostname,
            path: u.pathname + u.search,
            headers: {}
          }, res => {
            let d = "";
            res.on("data", c => d += c);
            res.on("end", () => resolve(d));
          }).on("error", reject);
        });
        console.log(`Got text: ${text.slice(0, 100)}`);
        break;
      }

      if (statusData.status === "error") throw new Error("Job failed: " + JSON.stringify(statusData).slice(0,300));
    }

    if (!text) throw new Error("Conversion timed out after 40 seconds");

    return { statusCode: 200, headers, body: JSON.stringify({ text }) };

  } catch(e) {
    console.error("Error:", e.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
