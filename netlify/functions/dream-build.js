const nodemailer = require('nodemailer');

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    let body;
    try {
        body = JSON.parse(event.body);
    } catch {
        return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
    }

    const { firstName, lastName, email, phone, description, contactMethod } = body;
    if (!firstName || !lastName || !email || !description) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Missing required fields' }) };
    }

    const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT) || 587,
        secure: Number(process.env.SMTP_PORT) === 465,
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
        }
    });

    const date = new Date().toLocaleString();

    try {
        await transporter.sendMail({
            from: process.env.SMTP_FROM || '"Weeecycle" <steve@weeecycle.net>',
            to: 'steve@weeecycle.net',
            subject: `New Dream Build Request — ${firstName} ${lastName}`,
            html: `
                <h2 style="font-family:sans-serif;color:#ff8000;">New Dream Build Consultation</h2>
                <table style="font-family:sans-serif;font-size:15px;border-collapse:collapse;width:100%;max-width:560px;">
                    <tr><td style="padding:8px 12px;color:#888;width:140px;">Name</td><td style="padding:8px 12px;">${firstName} ${lastName}</td></tr>
                    <tr style="background:#f9f9f9;"><td style="padding:8px 12px;color:#888;">Email</td><td style="padding:8px 12px;">${email}</td></tr>
                    <tr><td style="padding:8px 12px;color:#888;">Phone</td><td style="padding:8px 12px;">${phone || 'Not provided'}</td></tr>
                    <tr style="background:#f9f9f9;"><td style="padding:8px 12px;color:#888;">Contact via</td><td style="padding:8px 12px;">${contactMethod || 'email'}</td></tr>
                    <tr><td style="padding:8px 12px;color:#888;vertical-align:top;">Description</td><td style="padding:8px 12px;">${description.replace(/\n/g, '<br>')}</td></tr>
                    <tr style="background:#f9f9f9;"><td style="padding:8px 12px;color:#888;">Submitted</td><td style="padding:8px 12px;">${date}</td></tr>
                </table>
            `
        });

        // Customer confirmation — non-blocking
        transporter.sendMail({
            from: process.env.SMTP_FROM || '"Weeecycle" <steve@weeecycle.net>',
            to: email,
            subject: 'We received your Dream Build request!',
            html: `
                <div style="font-family:sans-serif;max-width:600px;margin:auto;border:1px solid #ddd;padding:30px;">
                    <h2 style="color:#ff8000;text-transform:uppercase;margin-top:0;">Build the Dream</h2>
                    <p>Hi ${firstName},</p>
                    <p>Thanks for reaching out! We've received your Dream Build request and Steve will be reviewing your vision shortly.</p>
                    <p><strong>We'll reach out via your preferred method (${contactMethod || 'email'}) soon.</strong></p>
                    <hr style="border:none;border-top:1px solid #eee;margin:20px 0;">
                    <p style="font-size:0.9em;color:#666;"><strong>Your request summary:</strong><br>${description.substring(0, 200)}${description.length > 200 ? '...' : ''}</p>
                    <p style="margin-top:30px;font-weight:bold;">WEEECYCLE.NET</p>
                </div>
            `
        }).catch(e => console.error('Customer confirmation error:', e.message));

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ success: true })
        };
    } catch (e) {
        console.error('Dream Build email error:', e.message);
        return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'Failed to submit request.' })
        };
    }
};
