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

    const { name, rating, message } = body;
    if (!name || !rating || !message) {
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

    const stars = '★'.repeat(Number(rating)) + '☆'.repeat(5 - Number(rating));

    try {
        await transporter.sendMail({
            from: process.env.SMTP_FROM || '"Weeecycle" <steve@weeecycle.net>',
            to: 'steve@weeecycle.net',
            subject: `New Review from ${name} — ${stars}`,
            html: `
                <h2 style="font-family:sans-serif;color:#ff8000;">New Review Submitted</h2>
                <table style="font-family:sans-serif;font-size:15px;border-collapse:collapse;width:100%;max-width:560px;">
                    <tr><td style="padding:8px 12px;color:#888;width:100px;">Name</td><td style="padding:8px 12px;">${name}</td></tr>
                    <tr style="background:#f9f9f9;"><td style="padding:8px 12px;color:#888;">Rating</td><td style="padding:8px 12px;">${stars} (${rating}/5)</td></tr>
                    <tr><td style="padding:8px 12px;color:#888;vertical-align:top;">Review</td><td style="padding:8px 12px;">${message.replace(/\n/g, '<br>')}</td></tr>
                </table>
            `
        });

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ success: true })
        };
    } catch (e) {
        console.error('Review email error:', e.message);
        return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'Failed to submit review.' })
        };
    }
};
