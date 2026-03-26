import sgMail from "@sendgrid/mail";

type SendGridEmailInput = {
  to: string;
  from: string;
  subject: string;
  text: string;
  html?: string;
};

let configuredApiKey: string | null = null;

function ensureSendGridConfigured() {
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) {
    throw new Error("Server misconfiguration: SENDGRID_API_KEY is not set.");
  }

  if (configuredApiKey !== apiKey) {
    sgMail.setApiKey(apiKey);
    configuredApiKey = apiKey;
  }
}

export async function sendWithSendGrid(input: SendGridEmailInput) {
  ensureSendGridConfigured();

  await sgMail.send({
    to: input.to,
    from: input.from,
    subject: input.subject,
    text: input.text,
    ...(input.html ? { html: input.html } : {}),
  });
}
