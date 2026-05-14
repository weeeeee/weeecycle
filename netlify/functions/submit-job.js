// Netlify Function: submit-job.js
// Handles POST /api/jobs from contact.html on the live Netlify site.
// Sends a service request notification email to steve@weeecycle.net via Resend.

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

    const { customer, email, phone, address, bike, service, description, date } = body;

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
        console.error('RESEND_API_KEY is not set in Netlify environment variables.');
        return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'Email service not configured.' })
        };
    }

    const submittedAt = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });

    async function sendEmail(payload) {
        const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        return { ok: res.ok, status: res.status, data };
    }

    const result = await sendEmail({
        from: 'Weeecycle <onboarding@resend.dev>',
        to: ['steve@weeecycle.net'],
        subject: `New Service Request: ${service || 'Unknown Service'} — Weeecycle.net`,
        html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: auto;">
                <h2 style="color: #FF8000; border-bottom: 3px solid #FF8000; padding-bottom: 8px; margin-top: 0;">
                    New Service Request
                </h2>
                <table style="width: 100%; border-collapse: collapse; font-size: 15px;">
                    <tr>
                        <td style="padding: 8px 12px; color: #888; width: 140px; font-weight: bold;">Service</td>
                        <td style="padding: 8px 12px;">${service || 'Not specified'}</td>
                    </tr>
                    <tr style="background: #f9f9f9;">
                        <td style="padding: 8px 12px; color: #888; font-weight: bold;">Customer</td>
                        <td style="padding: 8px 12px;">${customer || 'Not provided'}</td>
                    </tr>
                    <tr>
                        <td style="padding: 8px 12px; color: #888; font-weight: bold;">Email</td>
                        <td style="padding: 8px 12px;">${email || 'Not provided'}</td>
                    </tr>
                    <tr style="background: #f9f9f9;">
                        <td style="padding: 8px 12px; color: #888; font-weight: bold;">Phone</td>
                        <td style="padding: 8px 12px;">${phone || 'Not provided'}</td>
                    </tr>
                    <tr>
                        <td style="padding: 8px 12px; color: #888; font-weight: bold;">Bike</td>
                        <td style="padding: 8px 12px;">${bike || 'Not specified'}</td>
                    </tr>
                    <tr style="background: #f9f9f9;">
                        <td style="padding: 8px 12px; color: #888; font-weight: bold;">Address</td>
                        <td style="padding: 8px 12px;">${address || 'Not provided'}</td>
                    </tr>
                    <tr>
                        <td style="padding: 8px 12px; color: #888; font-weight: bold;">Date</td>
                        <td style="padding: 8px 12px;">${date || submittedAt}</td>
                    </tr>
                </table>
                ${description ? `
                <div style="margin-top: 16px;">
                    <strong style="color: #555;">Description / Notes:</strong>
                    <div style="background: #f4f4f4; padding: 12px; border-left: 4px solid #FF8000; margin-top: 8px; white-space: pre-wrap; font-size: 14px;">
                        ${description.replace(/\n/g, '<br>')}
                    </div>
                </div>` : ''}
                <p style="margin-top: 24px; color: #999; font-size: 12px;">
                    Submitted: ${submittedAt} — via Weeecycle.net
                </p>
            </div>
        `
    });

    console.log('Service request email result:', JSON.stringify(result));

    return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: result.ok, email: result })
    };
};
