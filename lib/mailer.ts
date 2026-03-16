import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST!,
  port: Number(process.env.SMTP_PORT || 587),
  secure: false,
  auth: {
    user: process.env.SMTP_USER!,
    pass: process.env.SMTP_PASS!,
  },
});

export async function sendInviteEmail(params: {
  to: string;
  orgName: string;
  inviteUrl: string;
  role: "owner" | "member" | "viewer";
}) {
  const { to, orgName, inviteUrl, role } = params;

  await transporter.sendMail({
    from: process.env.SMTP_FROM!,
    to,
    subject: `You’ve been invited to ${orgName}`,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.5;">
        <h2>You’ve been invited</h2>
        <p>You’ve been invited to join <b>${orgName}</b> as a <b>${role}</b>.</p>
        <p>Click the button below to create your password and access the dashboard:</p>
        <p>
          <a href="${inviteUrl}" style="display:inline-block;padding:10px 16px;background:#094929;color:#fff;text-decoration:none;border-radius:6px;">
            Accept Invite
          </a>
        </p>
        <p>If the button does not work, copy and paste this link into your browser:</p>
        <p>${inviteUrl}</p>
      </div>
    `,
  });
}