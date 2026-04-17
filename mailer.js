const nodemailer = require("nodemailer");

let cachedTransport = null;
let cachedSignature = null;

function getMailConfig() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    return null;
  }

  const port = Number(process.env.SMTP_PORT || 587);
  return {
    host,
    port,
    secure: process.env.SMTP_SECURE === "true" || port === 465,
    auth: { user, pass },
    from: process.env.SMTP_FROM || user,
  };
}

function isEmailConfigured() {
  return Boolean(getMailConfig());
}

function getTransport() {
  const config = getMailConfig();
  if (!config) {
    throw new Error("Password reset email is not configured");
  }

  const signature = JSON.stringify(config);
  if (!cachedTransport || cachedSignature !== signature) {
    cachedTransport = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.auth,
    });
    cachedSignature = signature;
  }

  return { transport: cachedTransport, from: config.from };
}

async function sendPasswordResetCode(email, code) {
  const { transport, from } = getTransport();
  await transport.sendMail({
    from,
    to: email,
    subject: "Beast Mode password reset code",
    text: `Your Beast Mode password reset code is ${code}. It expires in 15 minutes.`,
    html: `<p>Your Beast Mode password reset code is <strong>${code}</strong>.</p><p>It expires in 15 minutes.</p>`,
  });
}

module.exports = { isEmailConfigured, sendPasswordResetCode };
