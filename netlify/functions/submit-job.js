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
        try {
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
        } catch (e) {
            console.error('Email fetch error:', e);
            return { ok: false, error: e.message };
        }
    }

    // Send notification to Steve
    const steveResult = await sendEmail({
        from: 'Weeecycle <onboarding@resend.dev>',
        to: ['steve@weeecycle.net'],
        subject: `New Service Request: ${service || 'Unknown Service'} — Weeecycle.net`,
        html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: auto; border: 1px solid #eee; border-radius: 8px; overflow: hidden;">
                <div style="background: #0B0B3B; padding: 20px; color: white;">
                    <h2 style="margin: 0; font-size: 24px;">New Service Request</h2>
                </div>
                <div style="padding: 24px;">
                    <table style="width: 100%; border-collapse: collapse; font-size: 15px;">
                        <tr>
                            <td style="padding: 8px 0; color: #888; width: 120px; font-weight: bold;">Service</td>
                            <td style="padding: 8px 0; color: #111;">${service || 'Not specified'}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: #888; font-weight: bold;">Customer</td>
                            <td style="padding: 8px 0; color: #111;">${customer || 'Not provided'}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: #888; font-weight: bold;">Email</td>
                            <td style="padding: 8px 0; color: #111;"><a href="mailto:${email}" style="color: #FF8000;">${email || 'Not provided'}</a></td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: #888; font-weight: bold;">Phone</td>
                            <td style="padding: 8px 0; color: #111;">${phone || 'Not provided'}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: #888; font-weight: bold;">Bike</td>
                            <td style="padding: 8px 0; color: #111;">${bike || 'Not specified'}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: #888; font-weight: bold;">Address</td>
                            <td style="padding: 8px 0; color: #111;">${address || 'Not provided'}</td>
                        </tr>
                    </table>
                    
                    ${description ? `
                    <div style="margin-top: 24px; padding-top: 24px; border-top: 1px solid #eee;">
                        <strong style="color: #555; display: block; margin-bottom: 8px;">Description / Notes:</strong>
                        <div style="background: #f9f9f9; padding: 16px; border-radius: 4px; color: #333; line-height: 1.5; white-space: pre-wrap;">${description}</div>
                    </div>` : ''}
                </div>
                <div style="background: #f4f4f4; padding: 12px 24px; color: #999; font-size: 12px; text-align: center;">
                    Submitted: ${submittedAt} — via Weeecycle.net
                </div>
            </div>
        `
    });

    return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            success: steveResult.ok, 
            message: 'Service request recorded.',
            debug: steveResult.data 
        })
    };
};
