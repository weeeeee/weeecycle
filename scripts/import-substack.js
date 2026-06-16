#!/usr/bin/env node
/**
 * import-substack.js
 *
 * Converts Substack export HTML files into Weeecycle blog post pages.
 *
 * Setup (one-time):
 *   npm install cheerio
 *
 * Usage:
 *   node scripts/import-substack.js <path-to-posts-folder>
 *
 * The folder should be the "posts" directory from the Substack export ZIP.
 * Unzip the export first, then point to the posts/ subfolder.
 *
 * What it does:
 *   - Creates Blog/<slug>.html for each new post
 *   - Adds a card to blog.html
 *   - Adds a URL to sitemap.xml
 *   - Skips posts that already exist
 */

'use strict';

const fs   = require('fs');
const path = require('path');

let cheerio;
try {
  cheerio = require('cheerio');
} catch {
  console.error('\nMissing dependency. Run this first:\n  npm install cheerio\n');
  process.exit(1);
}

const ROOT     = path.join(__dirname, '..');
const BLOG_DIR = path.join(ROOT, 'Blog');

// ── Helpers ──────────────────────────────────────────────────────────────────

function slugify(str) {
  return str
    .toLowerCase()
    .replace(/[''""]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function readTime(text) {
  const mins = Math.max(1, Math.ceil(text.split(/\s+/).length / 200));
  return `${mins} min read`;
}

function isoDate(str) {
  try { return new Date(str).toISOString().split('T')[0]; }
  catch { return new Date().toISOString().split('T')[0]; }
}

function displayDate(str) {
  const d = new Date(str);
  if (isNaN(d)) return 'June 2026';
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

// ── Extract content from a Substack HTML export file ─────────────────────────

function parseSubstack(html) {
  const $ = cheerio.load(html);

  // Title
  const title = (
    $('h1.post-title').first().text() ||
    $('meta[property="og:title"]').attr('content') ||
    $('title').text().replace(/\s*[-|].*$/, '') ||
    'Untitled Post'
  ).trim();

  // Subtitle / excerpt
  const subtitle = (
    $('h3.subtitle, .subtitle, .post-subtitle').first().text() ||
    $('meta[property="og:description"]').attr('content') ||
    $('meta[name="description"]').attr('content') ||
    ''
  ).trim();

  // Date (try multiple sources)
  const dateRaw = (
    $('meta[name="published"]').attr('content') ||
    $('time').attr('datetime') ||
    $('[class*="date"]').first().attr('datetime') ||
    ''
  ).trim();

  // Body element — Substack uses several class combos across versions
  const bodyEl = (
    $('.body.markup').first().length       ? $('.body.markup').first()       :
    $('.available-content').first().length ? $('.available-content').first() :
    $('.post-content').first().length      ? $('.post-content').first()      :
    $('article').first().length            ? $('article').first()            :
    null
  );

  if (!bodyEl) return null;

  // Strip Substack subscribe / paywall widgets
  bodyEl.find([
    '.subscription-widget-wrap',
    '.paywall',
    '.button-wrapper',
    '[data-component-name]',
    '.email-subscribe',
    '.subscribe-widget',
    '.post-footer-cta',
    '.visibility-check',
    '.post-upsell',
    '.share-dialog',
    'button',
  ].join(',')).remove();

  const bodyHtml = bodyEl.html() || '';
  const bodyText = bodyEl.text();

  return { title, subtitle, dateRaw, bodyHtml, bodyText };
}

// ── Generate a full blog post page ───────────────────────────────────────────

function buildPostPage({ title, subtitle, dateRaw, bodyHtml, bodyText, slug, category }) {
  const pubDate    = isoDate(dateRaw);
  const dispDate   = displayDate(dateRaw);
  const rt         = readTime(bodyText);
  const desc       = escHtml(subtitle || title);
  const titleEsc   = escHtml(title);
  const canonical  = `https://weeecycle.net/Blog/${slug}.html`;
  const postSlug   = `Blog/${slug}`;

  return `<!DOCTYPE html>
<html class="scroll-smooth" lang="en">

<head>
    <!-- Google tag (gtag.js) -->
    <script async src="https://www.googletagmanager.com/gtag/js?id=G-PXE6HLHC80"></script>
    <script>
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', 'G-PXE6HLHC80');
    </script>
    <meta charset="utf-8" />
    <meta content="width=device-width, initial-scale=1.0" name="viewport" />
    <title>${titleEsc} | Weeecycle Blog</title>
    <meta name="description" content="${desc}" />
    <link rel="canonical" href="${canonical}" />
    <meta name="robots" content="index, follow" />

    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      "headline": "${titleEsc}",
      "description": "${desc}",
      "image": "https://weeecycle.net/images/hero_gravel_realistic.png",
      "datePublished": "${pubDate}",
      "dateModified": "${pubDate}",
      "author": { "@type": "Person", "name": "Weeecycle", "url": "https://weeecycle.net" },
      "publisher": {
        "@type": "Organization",
        "name": "Weeecycle Workshop",
        "url": "https://weeecycle.net",
        "logo": { "@type": "ImageObject", "url": "https://weeecycle.net/images/logo/gradient-bike.png" }
      },
      "mainEntityOfPage": { "@type": "WebPage", "@id": "${canonical}" }
    }
    </script>

    <meta property="og:type" content="article" />
    <meta property="og:url" content="${canonical}" />
    <meta property="og:title" content="${titleEsc} | Weeecycle Blog" />
    <meta property="og:description" content="${desc}" />
    <meta property="og:image" content="https://weeecycle.net/images/hero_gravel_realistic.png" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${titleEsc}" />
    <meta name="twitter:description" content="${desc}" />
    <meta name="twitter:image" content="https://weeecycle.net/images/hero_gravel_realistic.png" />

    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://fonts.googleapis.com/css2?family=Teko:wght@300;400;500;600;700&family=Roboto+Condensed:ital,wght@0,300;0,400;0,700;1,400&display=swap" rel="stylesheet" />
    <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,1,0" rel="stylesheet" />
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <script>
        tailwind.config = {
            theme: {
                extend: {
                    colors: {
                        brand: { dark: '#050511', blue: '#0B0B3B', orange: '#FF8000', slate: '#1e293b', light: '#f8fafc' }
                    },
                    fontFamily: { display: ['Teko', 'sans-serif'], body: ['Roboto Condensed', 'sans-serif'] }
                }
            }
        }
    </script>
    <style>
        ::-webkit-scrollbar { width: 8px; }
        ::-webkit-scrollbar-track { background: #050511; }
        ::-webkit-scrollbar-thumb { background: #FF8000; border-radius: 4px; }
        .post-body h2 { font-family:'Teko',sans-serif; font-weight:700; font-size:1.75rem; text-transform:uppercase; letter-spacing:.05em; color:#fff; margin-top:2.5rem; margin-bottom:.75rem; padding-bottom:.5rem; border-bottom:1px solid rgba(255,128,0,.2); }
        .post-body h3 { font-family:'Teko',sans-serif; font-size:1.4rem; color:#fff; text-transform:uppercase; margin-top:2rem; margin-bottom:.5rem; }
        .post-body p  { color:#d1d5db; font-size:1.05rem; line-height:1.8; margin-bottom:1.25rem; font-weight:300; }
        .post-body ul { list-style:none; margin-bottom:1.25rem; padding:0; }
        .post-body ul li { color:#d1d5db; font-size:1.05rem; font-weight:300; padding:.4rem 0 .4rem 1.75rem; position:relative; line-height:1.7; }
        .post-body ul li::before { content:''; position:absolute; left:0; top:.8rem; width:8px; height:8px; background:#FF8000; border-radius:50%; }
        .post-body ol { list-style:decimal; padding-left:1.75rem; margin-bottom:1.25rem; }
        .post-body ol li { color:#d1d5db; font-size:1.05rem; font-weight:300; line-height:1.7; margin-bottom:.4rem; }
        .post-body strong { color:#fff; font-weight:700; }
        .post-body em { font-style:italic; }
        .post-body a { color:#FF8000; text-decoration:underline; }
        .post-body a:hover { color:#fbbf24; }
        .post-body blockquote { border-left:3px solid #FF8000; padding-left:1.5rem; margin:2rem 0; color:#9ca3af; font-style:italic; }
        .post-body img { width:100%; border-radius:1rem; margin:1.5rem 0; border:1px solid rgba(255,255,255,.05); }
        .post-body figure { margin:1.5rem 0; }
        .post-body figcaption { color:#6b7280; font-size:.85rem; text-align:center; margin-top:.5rem; }
        .post-body hr { border:none; border-top:1px solid rgba(255,128,0,.15); margin:2.5rem 0; }
    </style>
    <link rel="icon" type="image/png" href="../images/logo/gradient-bike.png" />
    <link rel="apple-touch-icon" href="../images/logo/gradient-bike.png" />
    <link rel="manifest" href="/manifest.json" />
</head>

<body class="bg-brand-dark text-gray-200 font-body antialiased selection:bg-brand-orange selection:text-white pb-20 md:pb-0">

    <!-- Navigation -->
    <nav class="fixed top-0 w-full z-50 bg-brand-dark/95 backdrop-blur border-b border-brand-orange/20 shadow-xl transition-all duration-300">
        <div class="container mx-auto px-4 h-20 flex items-center justify-between">
            <a class="flex items-center gap-3 group" href="../index.html">
                <div class="h-12 w-12 relative overflow-hidden flex items-center justify-center">
                    <img src="../images/logo/gradient-bike.png" alt="Weeecycle Icon" class="h-10 w-auto object-contain drop-shadow-[0_0_5px_rgba(255,128,0,0.5)]" />
                </div>
                <div class="flex flex-col">
                    <span class="font-display font-bold text-2xl tracking-widest text-white leading-none">WEEECYCLE<span class="text-brand-orange">.NET</span></span>
                    <span class="font-body text-[10px] text-brand-orange uppercase tracking-[0.2em] leading-none">Recycle the Fun</span>
                </div>
            </a>
            <div class="hidden md:flex items-center gap-8">
                <a class="font-display text-lg hover:text-brand-orange transition uppercase tracking-wide" href="../index.html#services">Services</a>
                <a class="font-display text-lg hover:text-brand-orange transition uppercase tracking-wide" href="../index.html#handbook">Handbook</a>
                <a class="font-display text-lg text-brand-orange font-bold uppercase tracking-wide" href="../blog.html">Blog</a>
                <a class="font-display text-lg hover:text-brand-orange transition uppercase tracking-wide" href="../customer-portal.html">Repair Status</a>
                <a class="font-display text-lg hover:text-brand-orange transition uppercase tracking-wide" href="../shop.html">Shop</a>
                <a class="font-display text-lg hover:text-brand-orange transition uppercase tracking-wide" href="../reviews.html">Reviews</a>
                <a class="bg-brand-orange hover:bg-orange-600 text-white font-display font-bold uppercase tracking-wider py-2 px-6 rounded transition transform hover:-translate-y-1 shadow-lg shadow-orange-900/50" href="../index.html#services">Book Service</a>
                <div class="flex items-center gap-4 border-l border-gray-700 pl-6 ml-2">
                    <a href="https://www.instagram.com/weeecycle/" target="_blank" class="text-gray-400 hover:text-brand-orange transition-colors"><i class="fab fa-instagram text-xl"></i></a>
                    <a href="https://www.facebook.com/profile.php?id=61584485203543" target="_blank" class="text-gray-400 hover:text-brand-orange transition-colors"><i class="fab fa-facebook text-xl"></i></a>
                    <a href="https://www.youtube.com/@weeecycle" target="_blank" class="text-gray-400 hover:text-brand-orange transition-colors"><i class="fab fa-youtube text-xl"></i></a>
                    <a href="https://www.tiktok.com/@weeecycling" target="_blank" class="text-gray-400 hover:text-brand-orange transition-colors"><i class="fab fa-tiktok text-xl"></i></a>
                </div>
            </div>
            <button class="md:hidden text-white hover:text-brand-orange transition" onclick="document.getElementById('mobile-menu').classList.toggle('hidden')">
                <span class="material-symbols-outlined text-4xl">menu</span>
            </button>
        </div>
        <div class="hidden md:hidden bg-brand-dark border-t border-brand-orange/20 absolute w-full left-0 shadow-2xl" id="mobile-menu">
            <div class="flex flex-col p-4 space-y-4">
                <a class="text-xl font-display uppercase tracking-wide text-gray-200 hover:text-brand-orange transition" href="../index.html#services" onclick="this.closest('#mobile-menu').classList.add('hidden')">Services</a>
                <a class="text-xl font-display uppercase tracking-wide text-gray-200 hover:text-brand-orange transition" href="../index.html#handbook" onclick="this.closest('#mobile-menu').classList.add('hidden')">Handbook</a>
                <a class="text-brand-orange text-xl font-display font-bold uppercase tracking-wide" href="../blog.html">Blog</a>
                <a class="text-xl font-display uppercase tracking-wide text-gray-200" href="../customer-portal.html" onclick="this.closest('#mobile-menu').classList.add('hidden')">Repair Status</a>
                <a class="text-xl font-display uppercase tracking-wide text-gray-200" href="../shop.html" onclick="this.closest('#mobile-menu').classList.add('hidden')">Shop</a>
                <a class="text-xl font-display uppercase tracking-wide text-gray-200" href="../reviews.html" onclick="this.closest('#mobile-menu').classList.add('hidden')">Reviews</a>
                <a class="text-brand-orange text-xl font-display font-bold uppercase tracking-wide" href="../index.html#services" onclick="this.closest('#mobile-menu').classList.add('hidden')">Book Now</a>
                <div class="flex gap-6 pt-4 border-t border-gray-800">
                    <a href="https://www.instagram.com/weeecycle/" target="_blank" class="text-gray-400 hover:text-brand-orange transition-colors"><i class="fab fa-instagram text-2xl"></i></a>
                    <a href="https://www.facebook.com/profile.php?id=61584485203543" target="_blank" class="text-gray-400 hover:text-brand-orange transition-colors"><i class="fab fa-facebook text-2xl"></i></a>
                    <a href="https://www.youtube.com/@weeecycle" target="_blank" class="text-gray-400 hover:text-brand-orange transition-colors"><i class="fab fa-youtube text-2xl"></i></a>
                    <a href="https://www.tiktok.com/@weeecycling" target="_blank" class="text-gray-400 hover:text-brand-orange transition-colors"><i class="fab fa-tiktok text-2xl"></i></a>
                </div>
            </div>
        </div>
    </nav>

    <!-- Post Hero -->
    <section class="pt-32 pb-0 bg-brand-dark relative overflow-hidden">
        <div class="absolute top-0 right-0 w-[600px] h-[400px] bg-brand-orange/5 rounded-full blur-[120px] pointer-events-none"></div>
        <div class="container mx-auto px-4 max-w-4xl relative z-10 pb-10">
            <div class="flex items-center gap-2 text-gray-600 text-sm font-display uppercase tracking-wider mb-6">
                <a href="../blog.html" class="hover:text-brand-orange transition-colors">Blog</a>
                <span>/</span>
                <span class="text-gray-400">${escHtml(category)}</span>
            </div>
            <div class="flex flex-wrap items-center gap-3 mb-6">
                <span class="bg-brand-orange/10 text-brand-orange font-display font-bold text-xs uppercase tracking-widest py-1.5 px-4 rounded-full border border-brand-orange/20">
                    <i class="fa-solid fa-circle mr-1 text-xs"></i>${escHtml(category)}
                </span>
                <span class="text-gray-600 text-sm font-display uppercase tracking-wider">${dispDate}</span>
                <span class="text-gray-700">·</span>
                <span class="text-gray-600 text-sm font-display uppercase tracking-wider">${rt}</span>
            </div>
            <h1 class="font-display font-bold text-5xl md:text-7xl text-white uppercase tracking-tight leading-tight mb-6">
                <span class="text-transparent bg-clip-text bg-gradient-to-r from-brand-orange to-orange-300">${titleEsc}</span>
            </h1>
            <p class="text-gray-400 text-xl font-light leading-relaxed max-w-2xl">${escHtml(subtitle)}</p>
        </div>
        <div class="w-full max-w-4xl mx-auto px-4">
            <div class="rounded-2xl overflow-hidden border border-gray-800 shadow-2xl">
                <img src="../images/hero_gravel_realistic.png" alt="${titleEsc}" class="w-full h-72 md:h-96 object-cover" />
            </div>
        </div>
    </section>

    <!-- Post Body -->
    <article class="py-16 bg-brand-dark" itemscope itemtype="https://schema.org/BlogPosting">
        <div class="container mx-auto px-4 max-w-3xl">
            <div class="flex items-center gap-4 mb-12 pb-8 border-b border-gray-800">
                <div class="w-12 h-12 rounded-full bg-brand-orange/10 border border-brand-orange/30 flex items-center justify-center flex-shrink-0">
                    <i class="fa-solid fa-person-biking text-brand-orange"></i>
                </div>
                <div>
                    <p class="text-white font-display font-bold text-lg uppercase tracking-wide leading-none">Weeecycle</p>
                    <p class="text-gray-500 text-sm font-display uppercase tracking-wider mt-0.5">Lexington, KY &nbsp;·&nbsp; ${dispDate}</p>
                </div>
            </div>
            <div class="post-body" itemprop="articleBody">
${bodyHtml}
            </div>
            <div class="mt-12 pt-8 border-t border-gray-800 flex items-center gap-4">
                <div class="w-14 h-14 rounded-full bg-brand-orange/10 border border-brand-orange/30 flex items-center justify-center flex-shrink-0">
                    <i class="fa-solid fa-person-biking text-brand-orange text-xl"></i>
                </div>
                <div>
                    <p class="text-white font-display font-bold text-xl uppercase tracking-wide leading-none">Weeecycle</p>
                    <p class="text-gray-400 text-sm font-light mt-1">Road &amp; gravel enthusiast, bike builder, and founder of Weeecycle Workshop — Lexington, KY.</p>
                </div>
            </div>
            <div class="mt-8">
                <a href="../blog.html" class="inline-flex items-center gap-2 text-brand-orange font-display font-bold uppercase tracking-wider text-sm hover:gap-3 transition-all">
                    <i class="fa-solid fa-arrow-left text-xs"></i> Back to Blog
                </a>
            </div>
        </div>
    </article>

    <!-- Social Share -->
    <section class="py-10 bg-[#07070f] border-t border-gray-900">
        <div class="container mx-auto px-4 max-w-3xl">
            <div class="flex flex-col sm:flex-row items-center justify-between gap-4">
                <span class="font-display font-bold text-white uppercase tracking-widest text-base">Share This Post</span>
                <div class="flex items-center gap-3">
                    <button onclick="shareToFacebook()" title="Share on Facebook" class="w-11 h-11 rounded-full bg-[#1877f2]/10 border border-[#1877f2]/30 hover:bg-[#1877f2] text-[#1877f2] hover:text-white flex items-center justify-center transition-all duration-200"><i class="fab fa-facebook-f"></i></button>
                    <button onclick="shareToX()" title="Share on X" class="w-11 h-11 rounded-full bg-white/5 border border-gray-700 hover:bg-white hover:text-black text-gray-300 flex items-center justify-center transition-all duration-200"><i class="fab fa-x-twitter"></i></button>
                    <button onclick="shareToWhatsApp()" title="Share on WhatsApp" class="w-11 h-11 rounded-full bg-[#25d366]/10 border border-[#25d366]/30 hover:bg-[#25d366] text-[#25d366] hover:text-white flex items-center justify-center transition-all duration-200"><i class="fab fa-whatsapp"></i></button>
                    <button onclick="copyLink(this)" title="Copy link" class="w-11 h-11 rounded-full bg-brand-orange/10 border border-brand-orange/30 hover:bg-brand-orange text-brand-orange hover:text-white flex items-center justify-center transition-all duration-200"><i class="fa-solid fa-link"></i></button>
                    <p class="text-gray-500 text-xs font-display uppercase tracking-widest ml-2">or copy &amp; paste to Instagram</p>
                </div>
            </div>
        </div>
    </section>

    <!-- Comments -->
    <section class="py-16 bg-brand-dark border-t border-gray-900" id="comments">
        <div class="container mx-auto px-4 max-w-3xl">
            <div class="flex items-center gap-4 mb-10">
                <h2 class="font-display font-bold text-4xl text-white uppercase tracking-tight">
                    Comments <span class="text-brand-orange text-2xl" id="comment-count"></span>
                </h2>
            </div>
            <div id="comments-list" class="space-y-6 mb-12"></div>
            <div id="no-comments" class="hidden text-center py-10 mb-12">
                <div class="w-14 h-14 mx-auto rounded-full bg-brand-orange/10 border border-brand-orange/20 flex items-center justify-center mb-4">
                    <i class="fa-regular fa-comment text-brand-orange text-xl"></i>
                </div>
                <p class="text-gray-500 font-light">No comments yet. Be the first!</p>
            </div>
            <div class="bg-[#0B0B2B] border border-gray-800 rounded-2xl p-8">
                <h3 class="font-display font-bold text-2xl text-white uppercase tracking-wide mb-6">Leave a Comment</h3>
                <div id="comment-success" class="hidden mb-6 bg-green-900/30 border border-green-700/40 rounded-xl p-4">
                    <div class="flex items-center gap-3">
                        <i class="fa-solid fa-circle-check text-green-400 text-xl"></i>
                        <div>
                            <p class="text-white font-display font-bold uppercase tracking-wide text-sm">Comment Submitted</p>
                            <p class="text-gray-400 text-sm font-light mt-0.5">Thanks! Your comment is awaiting moderation and will appear shortly.</p>
                        </div>
                    </div>
                </div>
                <form id="comment-form" novalidate>
                    <input type="text" name="hp" style="display:none" tabindex="-1" autocomplete="off" aria-hidden="true" />
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                        <div>
                            <label class="block font-display font-bold text-xs uppercase tracking-widest text-gray-400 mb-2">Name <span class="text-brand-orange">*</span></label>
                            <input type="text" name="author_name" required maxlength="100" class="w-full bg-brand-dark border border-gray-700 focus:border-brand-orange rounded-lg px-4 py-3 text-white font-light text-sm outline-none transition-colors placeholder-gray-600" placeholder="Your name" />
                        </div>
                        <div>
                            <label class="block font-display font-bold text-xs uppercase tracking-widest text-gray-400 mb-2">Website <span class="text-gray-600 font-normal normal-case tracking-normal">(optional)</span></label>
                            <input type="url" name="author_website" maxlength="200" class="w-full bg-brand-dark border border-gray-700 focus:border-brand-orange rounded-lg px-4 py-3 text-white font-light text-sm outline-none transition-colors placeholder-gray-600" placeholder="https://your-site.com" />
                        </div>
                    </div>
                    <div class="mb-6">
                        <label class="block font-display font-bold text-xs uppercase tracking-widest text-gray-400 mb-2">Comment <span class="text-brand-orange">*</span></label>
                        <textarea name="body" required maxlength="5000" rows="5" class="w-full bg-brand-dark border border-gray-700 focus:border-brand-orange rounded-lg px-4 py-3 text-white font-light text-sm outline-none transition-colors placeholder-gray-600 resize-y" placeholder="Share your thoughts..."></textarea>
                    </div>
                    <div id="comment-error" class="hidden mb-4 text-red-400 text-sm font-display"></div>
                    <button type="submit" id="comment-submit" class="inline-flex items-center gap-2 bg-brand-orange hover:bg-orange-600 text-white font-display font-bold uppercase tracking-wider py-3 px-8 rounded-xl transition transform hover:scale-105 shadow-lg shadow-orange-900/40 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none">
                        <i class="fa-solid fa-paper-plane"></i>
                        <span>Post Comment</span>
                    </button>
                </form>
            </div>
        </div>
    </section>

    <!-- Footer -->
    <footer class="bg-black border-t border-gray-900 py-10">
        <div class="container mx-auto px-4 flex flex-col md:flex-row justify-between items-center gap-6">
            <div class="flex flex-col items-center md:items-start">
                <span class="font-display font-bold text-3xl tracking-widest text-white leading-none">WEEECYCLE<span class="text-brand-orange">.NET</span></span>
                <span class="text-gray-500 text-xs uppercase tracking-[0.2em] mt-2">Building Speed. Fixing Fun.</span>
            </div>
            <div class="flex flex-col items-center md:items-end gap-2">
                <a href="https://www.trustpilot.com/review/weeecycle.net" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-2 text-[#00b67a] hover:text-white transition text-sm font-display uppercase tracking-wider">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/></svg>
                    Review us on Trustpilot
                </a>
                <span class="text-gray-600 text-xs uppercase tracking-wider">&copy; 2026 Weeecycle | Lexington, KY. All rights reserved. &nbsp;&middot;&nbsp; <a href="/privacy.html" class="hover:text-brand-orange transition-colors">Privacy Policy</a></span>
            </div>
        </div>
    </footer>

    <script src="https://chatonbo.com/widget/chatonbo-widget.js" data-bot-id="8c5103fa-8367-42d1-92a8-b60504758ccd"></script>

    <script>
        const POST_SLUG = '${postSlug}';

        async function loadComments() {
            try {
                const res = await fetch(\`/api/comments?post=\${encodeURIComponent(POST_SLUG)}\`);
                const comments = await res.json();
                const list = document.getElementById('comments-list');
                const noComments = document.getElementById('no-comments');
                const countEl = document.getElementById('comment-count');
                if (!Array.isArray(comments) || comments.length === 0) { noComments.classList.remove('hidden'); return; }
                countEl.textContent = \`(\${comments.length})\`;
                list.innerHTML = comments.map(c => {
                    const date = new Date(c.created_at).toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' });
                    const initials = c.author_name.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();
                    const nameHtml = c.author_website
                        ? \`<a href="\${c.author_website}" target="_blank" rel="noopener noreferrer nofollow" class="text-white font-display font-bold uppercase tracking-wide hover:text-brand-orange transition-colors">\${c.author_name}</a>\`
                        : \`<span class="text-white font-display font-bold uppercase tracking-wide">\${c.author_name}</span>\`;
                    return \`<div class="flex gap-4"><div class="w-11 h-11 rounded-full bg-brand-orange/20 border border-brand-orange/30 flex items-center justify-center flex-shrink-0 font-display font-bold text-brand-orange text-sm">\${initials}</div><div class="flex-1 bg-[#0B0B2B] border border-gray-800 rounded-2xl p-5"><div class="flex items-center gap-3 mb-3">\${nameHtml}<span class="text-gray-600 text-xs font-display uppercase tracking-wider">\${date}</span></div><p class="text-gray-300 font-light text-sm leading-relaxed">\${c.body.replace(/\\n/g, '<br>')}</p></div></div>\`;
                }).join('');
            } catch (err) { console.error('Failed to load comments:', err); }
        }

        document.getElementById('comment-form').addEventListener('submit', async function(e) {
            e.preventDefault();
            const form = e.target;
            const submit = document.getElementById('comment-submit');
            const errorEl = document.getElementById('comment-error');
            const successEl = document.getElementById('comment-success');
            errorEl.classList.add('hidden');
            submit.disabled = true;
            submit.querySelector('span').textContent = 'Posting...';
            try {
                const res = await fetch('/api/comments', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ post_slug: POST_SLUG, author_name: form.author_name.value.trim(), author_website: form.author_website?.value.trim() || '', body: form.body.value.trim(), hp: form.hp.value })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Something went wrong.');
                form.reset();
                successEl.classList.remove('hidden');
                form.classList.add('opacity-50', 'pointer-events-none');
            } catch (err) {
                errorEl.textContent = err.message;
                errorEl.classList.remove('hidden');
                submit.disabled = false;
                submit.querySelector('span').textContent = 'Post Comment';
            }
        });

        function shareToFacebook() { window.open(\`https://www.facebook.com/sharer/sharer.php?u=\${encodeURIComponent(window.location.href)}\`, '_blank', 'width=600,height=400'); }
        function shareToX() { window.open(\`https://twitter.com/intent/tweet?url=\${encodeURIComponent(window.location.href)}&text=\${encodeURIComponent(document.title)}\`, '_blank', 'width=600,height=400'); }
        function shareToWhatsApp() { window.open(\`https://wa.me/?text=\${encodeURIComponent(document.title + ' ' + window.location.href)}\`, '_blank'); }
        async function copyLink(btn) {
            try {
                await navigator.clipboard.writeText(window.location.href);
                const icon = btn.querySelector('i');
                icon.className = 'fa-solid fa-check';
                btn.classList.add('bg-brand-orange','text-white','border-brand-orange');
                setTimeout(() => { icon.className = 'fa-solid fa-link'; btn.classList.remove('bg-brand-orange','text-white','border-brand-orange'); }, 2000);
            } catch (_) { alert('Copy this link: ' + window.location.href); }
        }

        loadComments();
    </script>
</body>
</html>`;
}

// ── Generate a blog card for blog.html ───────────────────────────────────────

function buildBlogCard({ title, slug, excerpt, dateRaw, category }) {
  const dispDate = displayDate(dateRaw);
  const titleEsc = escHtml(title);
  const excerptEsc = escHtml(excerpt);
  return `
                <!-- Post: ${titleEsc} -->
                <article class="bg-[#0B0B2B] border border-gray-800 rounded-2xl overflow-hidden hover:border-brand-orange/40 transition-all duration-300 group flex flex-col">
                    <a href="Blog/${slug}.html" class="block h-52 relative overflow-hidden">
                        <img src="images/hero_gravel_realistic.png" alt="${titleEsc}" class="w-full h-full object-cover opacity-60 group-hover:opacity-80 group-hover:scale-105 transition-all duration-500" />
                        <div class="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
                    </a>
                    <div class="p-6 flex flex-col flex-grow">
                        <div class="flex flex-wrap items-center gap-3 mb-3">
                            <span class="bg-brand-orange/10 text-brand-orange font-display font-bold text-xs uppercase tracking-widest py-1 px-3 rounded-full border border-brand-orange/20">${escHtml(category)}</span>
                            <span class="text-gray-600 text-sm font-display uppercase tracking-wider">${dispDate}</span>
                        </div>
                        <h2 class="font-display font-bold text-3xl text-white uppercase tracking-tight leading-tight mb-3 group-hover:text-brand-orange transition-colors">
                            <a href="Blog/${slug}.html">${titleEsc}</a>
                        </h2>
                        <p class="text-gray-400 font-light text-sm leading-relaxed mb-6 flex-grow">${excerptEsc}</p>
                        <a href="Blog/${slug}.html" class="inline-flex items-center gap-2 text-brand-orange font-display font-bold uppercase tracking-wider text-sm hover:gap-3 transition-all">
                            Read More <i class="fa-solid fa-arrow-right text-xs"></i>
                        </a>
                    </div>
                </article>`;
}

// ── Update blog.html ──────────────────────────────────────────────────────────

function updateBlogIndex(newCards, totalPosts) {
  const blogPath = path.join(ROOT, 'blog.html');
  let html = fs.readFileSync(blogPath, 'utf8');

  // Insert cards before the <!-- IMPORT_END --> marker
  if (!html.includes('<!-- IMPORT_END -->')) {
    console.warn('  [WARN] blog.html is missing the <!-- IMPORT_END --> marker — cards not inserted automatically.');
    console.log('\nAdd these cards manually to the grid in blog.html:\n');
    newCards.forEach(c => console.log(c));
    return;
  }

  html = html.replace('<!-- IMPORT_END -->', newCards.join('\n') + '\n            <!-- IMPORT_END -->');

  // Update post count badge
  html = html.replace(
    /\d+ Posts? Published/,
    `${totalPosts} Post${totalPosts !== 1 ? 's' : ''} Published`
  );

  fs.writeFileSync(blogPath, html);
}

// ── Update sitemap.xml ───────────────────────────────────────────────────────

function updateSitemap(posts) {
  const sitemapPath = path.join(ROOT, 'sitemap.xml');
  let sitemap = fs.readFileSync(sitemapPath, 'utf8');
  const today = new Date().toISOString().split('T')[0];

  const entries = posts
    .filter(({ slug }) => !sitemap.includes(`Blog/${slug}.html`))
    .map(({ slug, dateRaw }) => `  <url>
    <loc>https://weeecycle.net/Blog/${slug}.html</loc>
    <lastmod>${dateRaw ? isoDate(dateRaw) : today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`);

  if (entries.length) {
    sitemap = sitemap.replace('</urlset>', entries.join('\n') + '\n</urlset>');
    fs.writeFileSync(sitemapPath, sitemap);
    console.log(`  sitemap.xml — added ${entries.length} URL(s)`);
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

const exportDir = process.argv[2];
if (!exportDir) {
  console.log('\nUsage:  node scripts/import-substack.js <path-to-posts-folder>');
  console.log('Example: node scripts/import-substack.js ~/Downloads/substack-export/posts\n');
  process.exit(1);
}

if (!fs.existsSync(exportDir)) {
  console.error(`Folder not found: ${exportDir}`);
  process.exit(1);
}

const files = fs.readdirSync(exportDir)
  .filter(f => f.endsWith('.html'))
  .sort(); // oldest first (filename usually starts with date)

if (!files.length) {
  console.error('No .html files found in', exportDir);
  process.exit(1);
}

console.log(`\nFound ${files.length} HTML file(s) in ${exportDir}\n`);

const imported   = [];
const newCards   = [];
let   skipped    = 0;

for (const file of files) {
  const raw    = fs.readFileSync(path.join(exportDir, file), 'utf8');
  const parsed = parseSubstack(raw);

  if (!parsed) {
    console.log(`  [SKIP] ${file} — could not parse content`);
    skipped++;
    continue;
  }

  const { title, subtitle, dateRaw, bodyHtml, bodyText } = parsed;
  const slug     = slugify(title);
  const category = 'Blog Post';

  // Skip if the file already exists (e.g. weeecycle-what.html)
  const outPath = path.join(BLOG_DIR, `${slug}.html`);
  if (fs.existsSync(outPath)) {
    console.log(`  [SKIP] Blog/${slug}.html — already exists`);
    skipped++;
    continue;
  }

  // Build and write the post page
  const pageHtml = buildPostPage({ title, subtitle, dateRaw, bodyHtml, bodyText, slug, category });
  fs.writeFileSync(outPath, pageHtml);

  // Build the card for blog.html
  const excerpt = (subtitle || bodyText.replace(/\s+/g, ' ').substring(0, 140)).trim() + '…';
  newCards.push(buildBlogCard({ title, slug, excerpt, dateRaw, category }));
  imported.push({ title, slug, dateRaw });

  const rt = readTime(bodyText);
  console.log(`  [OK]  Blog/${slug}.html  "${title}"  (${rt})`);
}

// Update blog.html and sitemap.xml
if (imported.length) {
  const totalPosts = fs.readdirSync(BLOG_DIR).filter(f => f.endsWith('.html')).length;
  updateBlogIndex(newCards, totalPosts);
  updateSitemap(imported);

  console.log(`\nImported ${imported.length} post(s), skipped ${skipped}.`);
  console.log('\nNext steps:');
  console.log('  1. Review the generated pages in Blog/');
  console.log('  2. Check that images look correct (Substack images link to their CDN — that\'s fine)');
  console.log('  3. git add Blog/ blog.html sitemap.xml && git commit -m "feat: import Substack posts"');
} else {
  console.log(`\nNothing new imported (${skipped} skipped).`);
}
