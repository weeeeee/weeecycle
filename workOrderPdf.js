// Work order & inspection checklist: the two form templates (rim / disc brake) and the PDF renderer.
const PDFDocument = require('pdfkit');

const SHARED_SECTIONS = {
    wheels: (tireItem) => ({
        title: '3. WHEELS & TIRES (EXCLUDING HUB BEARINGS)',
        items: [
            { id: 'rimIntegrity', title: 'Rim Integrity & Spoke Tension', desc: 'Check rims for cracks/dents; inspect uniform spoke tension across drive/non-drive sides.' },
            { id: 'wheelTruing', title: 'Wheel Truing & Dish Alignment', desc: 'True laterally and radially in truing stand; verify wheel dish alignment.' },
            tireItem,
        ],
    }),
    frame: {
        title: '4. FRAME, COCKPIT & FASTENERS (EXCLUDING HEADSET/BB BEARINGS)',
        items: [
            { id: 'fasteners', title: 'Critical Fastener Torque Checks', desc: 'Torque stem faceplate/steerer (5-6Nm), seatpost (4-6Nm), saddle rails (8-12Nm), cranks.' },
            { id: 'frameFork', title: 'Frame, Fork & Dropouts', desc: 'Clean/inspect frame tubes & welds/layups for cracks; check dropout alignment.' },
            { id: 'cockpit', title: 'Cockpit Ergonomics & Wraps/Grips', desc: 'Verify lever/shifter alignment; check grip wear or bar tape condition.' },
        ],
    },
};

const NOTICE = 'Standard tune-up overhaul scope. Excludes hub bearing, headset bearing, and bottom bracket bearing overhauls unless specified under recommendations.';

const HEADER_BASE = [
    { key: 'customer', label: 'CUSTOMER' },
    { key: 'bike', label: 'BIKE YEAR / MAKE / MODEL' },
    { key: 'date', label: 'DATE', type: 'date' },
    { key: 'tech', label: 'TECH / MECHANIC' },
    { key: 'serial', label: 'SERIAL #' },
    { key: 'chainWear', label: 'CHAIN WEAR (%)' },
];

const TEMPLATES = {
    rim: {
        edition: 'rim',
        editionLabel: 'Rim Brake',
        title: 'STANDARD TUNE-UP & OVERHAUL — RIM BRAKE EDITION',
        notice: NOTICE,
        headerFields: [...HEADER_BASE, { key: 'tirePressure', label: 'TIRE PRESSURE (F/R)' }, { key: 'woTag', label: 'WO / TAG #' }],
        sections: [
            {
                title: '1. DRIVETRAIN & SHIFTING SYSTEM',
                items: [
                    { id: 'chainCassette', title: 'Chain & Cassette Inspection', desc: 'Measure stretch (>0.5%/0.75%), degrease bath, check cog wear & burrs.' },
                    { id: 'derailleur', title: 'Derailleur Servicing & Hanger Alignment', desc: 'Clean/lube pivots & pulleys; align hanger with DAG gauge; lube/check cables.' },
                    { id: 'indexing', title: 'Indexing, Cable Tension & Limits', desc: 'Adjust H/L limit screws, reset cable tension, set B-gap clearance.' },
                ],
            },
            {
                title: '2. RIM BRAKING SYSTEM',
                items: [
                    { id: 'brakeTracks', title: 'Rim Brake Tracks Inspection', desc: 'Clean with isopropyl alcohol; inspect lateral wear indicators & brake track grooving.' },
                    { id: 'brakePads', title: 'Brake Pad Inspection & De-glazing', desc: 'Inspect wear lines, pick out embedded metal/debris, file/de-glaze pad surface.' },
                    { id: 'caliper', title: 'Caliper Alignment, Cable & Toe-In', desc: 'Set pad height, angle & toe-in; center caliper arms; adjust cable tension & lever pull.' },
                ],
            },
            SHARED_SECTIONS.wheels({ id: 'tires', title: 'Tires, Rim Tape & Inflation', desc: 'Inspect casing/tread for cuts/rot; check rim tape coverage; set pressure.' }),
            SHARED_SECTIONS.frame,
            {
                title: '5. FINAL QUALITY ASSURANCE & ROAD TEST',
                items: [
                    { id: 'roadTest', title: 'Safety Check & Road Test', desc: 'Verify QR/thru-axles; test shifting under load; bed-in rim pads; check for creaks.' },
                ],
            },
        ],
    },
    disc: {
        edition: 'disc',
        editionLabel: 'Disc Brake',
        title: 'STANDARD TUNE-UP & OVERHAUL — DISC BRAKE EDITION',
        notice: NOTICE,
        headerFields: [...HEADER_BASE, { key: 'rotorThickness', label: 'ROTOR THICKNESS (F/R)' }, { key: 'woTag', label: 'WO / TAG #' }],
        sections: [
            {
                title: '1. DRIVETRAIN & SHIFTING SYSTEM',
                items: [
                    { id: 'chainCassette', title: 'Chain & Cassette Inspection', desc: 'Measure stretch (>0.5%/0.75%), degrease bath, check cog wear & burrs.' },
                    { id: 'derailleur', title: 'Derailleur Servicing & Hanger Alignment', desc: 'Clean/lube pivots & pulleys; align hanger with DAG gauge; lube/check cables/e-tap.' },
                    { id: 'indexing', title: 'Indexing, Cable Tension & Limits', desc: 'Adjust H/L limit screws, reset cable/trim tension, set B-gap clearance.' },
                ],
            },
            {
                title: '2. DISC BRAKING SYSTEM',
                items: [
                    { id: 'rotors', title: 'Rotor Inspection & Cleaning', desc: 'Clean with isopropyl alcohol; true rotor dish; measure thickness vs spec (≥1.5mm).' },
                    { id: 'brakePads', title: 'Brake Pad & Caliper Servicing', desc: 'Inspect friction material (≥1mm remaining); sand/de-glaze pads; reset pistons.' },
                    { id: 'caliper', title: 'Caliper Alignment & Fluid/Cable Check', desc: 'Align caliper body (eliminate rub); torque rotor/caliper bolts (6Nm); check lever feel/bleed.' },
                ],
            },
            SHARED_SECTIONS.wheels({ id: 'tires', title: 'Tires, Tubeless/Tubes & Pressure', desc: 'Inspect casing/tread; check sealant levels (refresh if dry) or tubes; set PSI.' }),
            SHARED_SECTIONS.frame,
            {
                title: '5. FINAL QUALITY ASSURANCE & ROAD TEST',
                items: [
                    { id: 'roadTest', title: 'Safety Check & Bed-in Road Test', desc: 'Torque thru-axles/QR; test shifting under load; perform pad bed-in stops; check for creaks.' },
                ],
            },
        ],
    },
};

// Keeps only known fields, with sane lengths, so a saved work order can never contain arbitrary data.
function cleanWorkOrderData(edition, raw) {
    const tpl = TEMPLATES[edition];
    const str = (v, max) => String(v == null ? '' : v).slice(0, max);
    const header = {};
    tpl.headerFields.forEach(f => { header[f.key] = str(raw && raw.header && raw.header[f.key], 120); });
    const items = {};
    tpl.sections.forEach(sec => sec.items.forEach(it => {
        const r = (raw && raw.items && raw.items[it.id]) || {};
        items[it.id] = { pass: !!r.pass, adjusted: !!r.adjusted, recommend: !!r.recommend, notes: str(r.notes, 300) };
    }));
    return { header, items, remarks: str(raw && raw.remarks, 2000), signature: str(raw && raw.signature, 80), dateCompleted: str(raw && raw.dateCompleted, 20) };
}

// The PDF uses the built-in Helvetica fonts, which only cover Western characters.
function pdfText(value) {
    return String(value == null ? '' : value)
        .replace(/≥/g, '>=').replace(/≤/g, '<=')
        .replace(/[\r\t]/g, ' ')
        .replace(/[^\n\x20-\x7E -ÿ–—‘’“”•€]/g, '?');
}

function fmtDate(value) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
    return m ? `${m[2]}/${m[3]}/${m[1]}` : (value || '');
}

const C = {
    navy: '#0f1b2d', blue: '#0b84c6', ink: '#1e293b', muted: '#5b6675', line: '#c5d0de',
    band: '#dfe6ef', cellBg: '#f3f6fa', notice: '#edf1f7', accent: '#64748b',
    pass: '#15803d', adjusted: '#1d4ed8', recommend: '#c2410c',
};

const PAGE = { w: 612, h: 792, mx: 30, top: 26, bottom: 40 };
const CONTENT_W = PAGE.w - PAGE.mx * 2;
// Table columns: item | pass | adjusted | recommend | notes
const COLS = { item: 243, box: 66, notes: 111 };
const X = {
    item: PAGE.mx,
    pass: PAGE.mx + COLS.item,
    adjusted: PAGE.mx + COLS.item + COLS.box,
    recommend: PAGE.mx + COLS.item + COLS.box * 2,
    notes: PAGE.mx + COLS.item + COLS.box * 3,
    end: PAGE.mx + CONTENT_W,
};

// Fits a single line of text into `width`: shrinks the font a little first, then cuts it with an ellipsis.
function drawFitted(doc, text, x, y, width, { font = 'Helvetica', size = 9, minSize = 6.5, color = '#000' } = {}) {
    let s = size;
    doc.font(font).fontSize(s);
    while (doc.widthOfString(text) > width && s > minSize) { s -= 0.5; doc.fontSize(s); }
    let out = text;
    if (doc.widthOfString(out) > width) {
        while (out.length > 1 && doc.widthOfString(out + '…') > width) out = out.slice(0, -1);
        out += '…';
    }
    doc.fillColor(color).text(out, x, y, { lineBreak: false });
}

function drawCheckbox(doc, cx, cy, checked, color) {
    const s = 9;
    const x = cx - s / 2;
    const y = cy - s / 2;
    doc.save();
    doc.lineWidth(0.8).strokeColor(checked ? color : '#6b7280').roundedRect(x, y, s, s, 1.5);
    if (checked) doc.fillAndStroke('#ffffff', color); else doc.stroke();
    if (checked) {
        doc.lineWidth(1.6).lineCap('round').lineJoin('round').strokeColor(color)
            .moveTo(x + 1.8, y + 4.8).lineTo(x + 3.8, y + 7).lineTo(x + 7.4, y + 2).stroke();
    }
    doc.restore();
}

function renderWorkOrderPdf(order) {
    const tpl = TEMPLATES[order.edition];
    const data = order.data;
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({
            size: 'LETTER', margin: 0, bufferPages: true,
            info: { Title: `Work Order & Inspection Checklist - ${tpl.editionLabel}`, Author: 'Weeecycle.net', Subject: pdfText(data.header.customer || '') },
        });
        const chunks = [];
        doc.on('data', c => chunks.push(c));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        let y = PAGE.top;

        const drawTitle = () => {
            doc.font('Helvetica-Bold').fontSize(16).fillColor(C.navy).text('WORK ORDER & INSPECTION CHECKLIST', PAGE.mx, y, { lineBreak: false });
            doc.font('Helvetica-Bold').fontSize(8).fillColor(C.ink).text('Status Key:', PAGE.mx, y + 1, { width: CONTENT_W, align: 'right', lineBreak: false });
            doc.font('Helvetica').fontSize(7).fillColor(C.muted)
                .text('P = Pass  |  A = Adjusted/Serviced  |  R = Recommend Service', PAGE.mx, y + 12, { width: CONTENT_W, align: 'right', lineBreak: false });
            doc.font('Helvetica-Bold').fontSize(8.5).fillColor(C.blue).text(pdfText(tpl.title), PAGE.mx, y + 24, { lineBreak: false });
            doc.moveTo(PAGE.mx, y + 36).lineTo(PAGE.mx + CONTENT_W, y + 36).lineWidth(1).strokeColor(C.ink).stroke();
            y += 42;
        };

        const drawHeaderGrid = () => {
            const widths = [120, 160, 150, 122];
            const rowH = 22;
            tpl.headerFields.forEach((f, i) => {
                const row = Math.floor(i / 4);
                const col = i % 4;
                const x = PAGE.mx + widths.slice(0, col).reduce((a, b) => a + b, 0);
                const cy = y + row * rowH;
                doc.rect(x, cy, widths[col], rowH).fillAndStroke(C.cellBg, C.line);
                doc.font('Helvetica-Bold').fontSize(6).fillColor(C.muted).text(pdfText(f.label) + ':', x + 5, cy + 3.5, { width: widths[col] - 10, lineBreak: false });
                const raw = f.type === 'date' ? fmtDate(data.header[f.key]) : data.header[f.key];
                drawFitted(doc, pdfText(raw || ''), x + 5, cy + 11.5, widths[col] - 10, { size: 8.5, color: C.navy });
            });
            y += rowH * 2 + 6;
        };

        const drawNotice = () => {
            const h = 23;
            doc.rect(PAGE.mx, y, CONTENT_W, h).fill(C.notice);
            doc.rect(PAGE.mx, y, 3, h).fill(C.accent);
            doc.font('Helvetica-BoldOblique').fontSize(6.8).fillColor(C.muted);
            const lead = 'Scope Exclusion Notice: ';
            doc.text(lead, PAGE.mx + 10, y + 4.5, { width: CONTENT_W - 18, continued: true });
            doc.font('Helvetica-Oblique').text(pdfText(tpl.notice), { width: CONTENT_W - 18 });
            y += h + 6;
        };

        const drawTableHeader = () => {
            const h = 22;
            doc.rect(PAGE.mx, y, CONTENT_W, h).fill(C.navy);
            doc.font('Helvetica-Bold').fontSize(6.8).fillColor('#ffffff');
            doc.text('INSPECTION ITEM & SERVICE TASKS', X.item + 6, y + 7.5, { lineBreak: false });
            [['PASS', X.pass], ['ADJUSTED', X.adjusted], ['RECOMMEND', X.recommend]].forEach(([t, x]) => {
                doc.text(t, x, y + 7.5, { width: COLS.box, align: 'center', lineBreak: false });
            });
            doc.text('MECHANIC NOTES / MEASUREMENTS', X.notes + 5, y + 3.5, { width: COLS.notes - 8 });
            y += h;
        };

        const newPage = () => {
            doc.addPage();
            y = PAGE.top;
            drawFitted(doc, `WORK ORDER & INSPECTION CHECKLIST — continued  (${pdfText(data.header.customer || '')})`, PAGE.mx, y, CONTENT_W, { font: 'Helvetica-Bold', size: 9, minSize: 7, color: C.navy });
            y += 16;
            drawTableHeader();
        };

        const ensureSpace = (needed) => {
            if (y + needed > PAGE.h - PAGE.bottom) { newPage(); return true; }
            return false;
        };

        // ---- page 1
        drawTitle();
        drawHeaderGrid();
        drawNotice();
        drawTableHeader();

        tpl.sections.forEach(sec => {
            ensureSpace(13 + 27);
            doc.rect(PAGE.mx, y, CONTENT_W, 13).fillAndStroke(C.band, C.line);
            doc.font('Helvetica-Bold').fontSize(7.6).fillColor(C.ink).text(pdfText(sec.title), X.item + 6, y + 3.5, { lineBreak: false });
            y += 13;

            sec.items.forEach(it => {
                const ans = data.items[it.id] || {};
                const titleH = 9;
                doc.font('Helvetica').fontSize(6.6);
                const descH = doc.heightOfString(pdfText(it.desc), { width: COLS.item - 14 });
                doc.font('Helvetica').fontSize(7.4);
                const notesH = ans.notes ? doc.heightOfString(pdfText(ans.notes), { width: COLS.notes - 10 }) + 8 : 0;
                const rowH = Math.max(25, titleH + descH + 9, notesH);
                ensureSpace(rowH);

                doc.rect(PAGE.mx, y, CONTENT_W, rowH).lineWidth(0.6).strokeColor(C.line).stroke();
                [X.pass, X.adjusted, X.recommend, X.notes].forEach(x => doc.moveTo(x, y).lineTo(x, y + rowH).lineWidth(0.6).strokeColor(C.line).stroke());

                doc.font('Helvetica-Bold').fontSize(7.8).fillColor(C.navy).text(pdfText(it.title), X.item + 6, y + 4, { width: COLS.item - 12, lineBreak: false });
                doc.font('Helvetica').fontSize(6.6).fillColor(C.muted).text(pdfText(it.desc), X.item + 6, y + 4 + titleH, { width: COLS.item - 14 });

                const midY = y + rowH / 2;
                drawCheckbox(doc, X.pass + COLS.box / 2, midY, !!ans.pass, C.pass);
                drawCheckbox(doc, X.adjusted + COLS.box / 2, midY, !!ans.adjusted, C.adjusted);
                drawCheckbox(doc, X.recommend + COLS.box / 2, midY, !!ans.recommend, C.recommend);

                if (ans.notes) doc.font('Helvetica').fontSize(7.4).fillColor(C.ink).text(pdfText(ans.notes), X.notes + 5, y + 4, { width: COLS.notes - 10 });
                y += rowH;
            });
        });

        // ---- remarks + signature
        y += 8;
        doc.font('Helvetica').fontSize(8.2);
        const remarksText = pdfText(data.remarks || '');
        const remarksH = remarksText ? doc.heightOfString(remarksText, { width: CONTENT_W - 20 }) : 0;
        const boxH = Math.max(46, 22 + remarksH + 8);
        ensureSpace(boxH + 34);
        doc.rect(PAGE.mx, y, CONTENT_W, boxH).fillAndStroke('#fafbfc', C.line);
        doc.font('Helvetica-Bold').fontSize(7.8).fillColor(C.ink).text('ADDITIONAL RECOMMENDATIONS / CUSTOMER REMARKS:', PAGE.mx + 10, y + 7, { lineBreak: false });
        if (remarksText) doc.font('Helvetica').fontSize(8.2).fillColor(C.navy).text(remarksText, PAGE.mx + 10, y + 20, { width: CONTENT_W - 20 });
        y += boxH + 18;

        const sigX = PAGE.mx + 92;
        doc.font('Helvetica-Bold').fontSize(8).fillColor(C.ink).text('Mechanic Signature:', PAGE.mx, y, { lineBreak: false });
        doc.moveTo(sigX, y + 9).lineTo(sigX + 190, y + 9).lineWidth(0.6).strokeColor(C.ink).stroke();
        if (data.signature) drawFitted(doc, pdfText(data.signature), sigX + 4, y - 5, 184, { font: 'Times-Italic', size: 13, minSize: 9, color: C.navy });
        const dateLabelX = PAGE.mx + CONTENT_W - 195;
        doc.font('Helvetica-Bold').fontSize(8).fillColor(C.ink).text('Date Completed:', dateLabelX, y, { lineBreak: false });
        doc.moveTo(dateLabelX + 72, y + 9).lineTo(PAGE.mx + CONTENT_W, y + 9).lineWidth(0.6).strokeColor(C.ink).stroke();
        if (data.dateCompleted) doc.font('Helvetica').fontSize(9).fillColor(C.navy).text(pdfText(fmtDate(data.dateCompleted)), dateLabelX + 76, y - 1, { width: 118, lineBreak: false });

        // ---- page numbers
        const range = doc.bufferedPageRange();
        for (let i = 0; i < range.count; i++) {
            doc.switchToPage(range.start + i);
            doc.font('Helvetica').fontSize(8).fillColor(C.muted)
                .text(`Page ${i + 1} of ${range.count}`, PAGE.mx, PAGE.h - 32, { width: CONTENT_W, align: 'right', lineBreak: false });
        }
        doc.end();
    });
}

module.exports = { TEMPLATES, cleanWorkOrderData, renderWorkOrderPdf };
