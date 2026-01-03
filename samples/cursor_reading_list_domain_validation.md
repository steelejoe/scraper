# Reading list domain validation
_Exported on 1/3/2026 at 10:39:51 PST from Cursor (2.3.15)_

---

**User**

@reading-list.txt Loop through all the URLs in this file and make a list of the unique domains. For each unique domain, check whether it has a valid DNS and you can see a valid website when browsing to that domain directly.

---

**Cursor**

Creating a script to extract unique domains from the URLs and check their DNS and website accessibility.


Creating a script to extract unique domains and check their DNS and website accessibility:


```javascript
import fs from 'fs-extra';
import dns from 'dns/promises';
import https from 'https';
import http from 'http';
import { URL } from 'url';

const READING_LIST_PATH = './reading-list.txt';

// Extract domain from URL
function extractDomain(urlString) {
  try {
    const url = new URL(urlString);
    return url.hostname;
  } catch (error) {
    return null;
  }
}

// Check DNS resolution
async function checkDNS(domain) {
  try {
    await dns.resolve4(domain);
    return { valid: true, error: null };
  } catch (error) {
    // Try IPv6 as fallback
    try {
      await dns.resolve6(domain);
      return { valid: true, error: null };
    } catch (error6) {
      return { valid: false, error: error.message };
    }
  }
}

// Check if website is accessible
async function checkWebsite(domain) {
  return new Promise((resolve) => {
    const url = `https://${domain}`;
    const options = {
      hostname: domain,
      port: 443,
      path: '/',
      method: 'HEAD',
      timeout: 5000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; DomainChecker/1.0)'
      }
    };

    const req = https.request(options, (res) => {
      resolve({ 
        accessible: true, 
        statusCode: res.statusCode,
        error: null 
      });
      res.destroy();
    });

    req.on('error', (error) => {
      // Try HTTP as fallback
      const httpOptions = {
        hostname: domain,
        port: 80,
        path: '/',
        method: 'HEAD',
        timeout: 5000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; DomainChecker/1.0)'
        }
      };

      const httpReq = http.request(httpOptions, (res) => {
        resolve({ 
          accessible: true, 
          statusCode: res.statusCode,
          error: null,
          httpOnly: true
        });
        res.destroy();
      });

      httpReq.on('error', (httpError) => {
        resolve({ 
          accessible: false, 
          statusCode: null,
          error: error.message 
        });
      });

      httpReq.on('timeout', () => {
        httpReq.destroy();
        resolve({ 
          accessible: false, 
          statusCode: null,
          error: 'Timeout' 
        });
      });

      httpReq.setTimeout(5000);
      httpReq.end();
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ 
        accessible: false, 
        statusCode: null,
        error: 'Timeout' 
      });
    });

    req.setTimeout(5000);
    req.end();
  });
}

async function main() {
  console.log('Reading URLs from reading-list.txt...\n');
  
  // Read file
  const fileContent = await fs.readFile(READING_LIST_PATH, 'utf-8');
  const urls = fileContent
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0);

  console.log(`Found ${urls.length} URLs\n`);

  // Extract unique domains
  const domains = new Set();
  for (const urlString of urls) {
    const domain = extractDomain(urlString);
    if (domain) {
      domains.add(domain);
    }
  }

  const uniqueDomains = Array.from(domains).sort();
  console.log(`Found ${uniqueDomains.length} unique domains\n`);
  console.log('='.repeat(80));
  console.log('Checking domains...\n');

  const results = [];
  let processed = 0;

  for (const domain of uniqueDomains) {
    process.stdout.write(`Checking ${domain}... `);
    
    // Check DNS
    const dnsResult = await checkDNS(domain);
    
    if (dnsResult.valid) {
      // Check website accessibility
      const websiteResult = await checkWebsite(domain);
      results.push({
        domain,
        dnsValid: true,
        websiteAccessible: websiteResult.accessible,
        statusCode: websiteResult.statusCode,
        httpOnly: websiteResult.httpOnly || false,
        error: websiteResult.error
      });

      if (websiteResult.accessible) {
        const protocol = websiteResult.httpOnly ? 'HTTP' : 'HTTPS';
        const status = websiteResult.statusCode || 'OK';
        console.log(`✓ DNS: ✓, Website: ✓ (${protocol} ${status})`);
      } else {
        console.log(`✓ DNS: ✓, Website: ✗ (${websiteResult.error || 'Not accessible'})`);
      }
    } else {
      results.push({
        domain,
        dnsValid: false,
        websiteAccessible: false,
        statusCode: null,
        error: dnsResult.error
      });
      console.log(`✗ DNS: ✗ (${dnsResult.error})`);
    }

    processed++;
    // Small delay to avoid overwhelming servers
    if (processed < uniqueDomains.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('\nSUMMARY\n');
  
  const validDNS = results.filter(r => r.dnsValid).length;
  const accessible = results.filter(r => r.websiteAccessible).length;
  
  console.log(`Total unique domains: ${uniqueDomains.length}`);
  console.log(`Domains with valid DNS: ${validDNS}`);
  console.log(`Domains with accessible websites: ${accessible}`);
  console.log(`Domains with invalid DNS: ${uniqueDomains.length - validDNS}`);
  console.log(`Domains with inaccessible websites: ${uniqueDomains.length - accessible}`);

  console.log('\n' + '='.repeat(80));
  console.log('\nDETAILED RESULTS\n');
  
  // Group by status
  const validAndAccessible = results.filter(r => r.dnsValid && r.websiteAccessible);
  const validButInaccessible = results.filter(r => r.dnsValid && !r.websiteAccessible);
  const invalidDNS = results.filter(r => !r.dnsValid);

  if (validAndAccessible.length > 0) {
    console.log('\n✓ Valid DNS + Accessible Website:');
    validAndAccessible.forEach(r => {
      const protocol = r.httpOnly ? 'HTTP' : 'HTTPS';
      console.log(`  - ${r.domain} (${protocol} ${r.statusCode})`);
    });
  }

  if (validButInaccessible.length > 0) {
    console.log('\n✓ Valid DNS but ✗ Inaccessible Website:');
    validButInaccessible.forEach(r => {
      console.log(`  - ${r.domain} (${r.error || 'Unknown error'})`);
    });
  }

  if (invalidDNS.length > 0) {
    console.log('\n✗ Invalid DNS:');
    invalidDNS.forEach(r => {
      console.log(`  - ${r.domain} (${r.error})`);
    });
  }
}

main().catch(console.error);

```

Running the script to check all domains:


Script completed. Checking for linting issues, then summarizing the results:


Creating a summary report file with the results:


```plaintext
DOMAIN CHECK RESULTS
Generated from reading-list.txt

SUMMARY
=======
Total unique domains: 87
Domains with valid DNS: 81 (93.1%)
Domains with accessible websites: 78 (89.7%)
Domains with invalid DNS: 6 (6.9%)
Domains with inaccessible websites: 9 (10.3%)

VALID DNS + ACCESSIBLE WEBSITE (78 domains)
===========================================
These domains have valid DNS records and respond to HTTP/HTTPS requests:

1. absolute-necromancer.com (HTTP 302)
2. asuracomic.net (HTTPS 200)
3. autohuntingwithmyclone.com (HTTPS 302)
4. berserkgluttony.com (HTTPS 200)
5. comick.io (HTTPS 200)
6. dragontea.ink (HTTPS 403) - Note: Returns 403 but is accessible
7. en-thunderscans.com (HTTPS 200)
8. existencemanga.com (HTTPS 302)
9. granddwarf.com (HTTPS 200)
10. gravitytales.com (HTTPS 200)
11. h.mangabat.com (HTTPS 301)
12. hostednovel.com (HTTPS 200)
13. isthisheroforreal.com (HTTPS 301)
14. kirascans.com (HTTPS 200)
15. kunmanga.com (HTTPS 403) - Note: Returns 403 but is accessible
16. level1player.com (HTTPS 302)
17. lightnovelstranslations.com (HTTPS 200)
18. manga4life.com (HTTPS 200)
19. mangabuddy.com (HTTPS 302)
20. mangaclash.com (HTTPS 301)
21. mangadex.org (HTTPS 405) - Note: Returns 405 (Method Not Allowed) but is accessible
22. mangafire.to (HTTPS 200)
23. mangareader.to (HTTPS 200)
24. mangatoto.com (HTTPS 200)
25. manhuafast.com (HTTPS 200)
26. manhuafast.net (HTTPS 403) - Note: Returns 403 but is accessible
27. manhuaplus.com (HTTPS 200)
28. manhuaplus.org (HTTPS 302)
29. manhuatop.org (HTTPS 403) - Note: Returns 403 but is accessible
30. manhuaus.com (HTTPS 403) - Note: Returns 403 but is accessible
31. manhuaus.org (HTTPS 200)
32. manhwatop.com (HTTPS 403) - Note: Returns 403 but is accessible
33. manhwaz.com (HTTPS 200)
34. mtlreader.com (HTTPS 200)
35. novelbin.com (HTTPS 403) - Note: Returns 403 but is accessible
36. novelbuddy.com (HTTPS 302)
37. novellive.app (HTTPS 403) - Note: Returns 403 but is accessible
38. novellive.org (HTTPS 200)
39. odinscans.com (HTTP 302)
40. pickmeupgacha.com (HTTPS 301)
41. readnovel.eu (HTTPS 200)
42. regressorfallenfamily.com (HTTPS 302)
43. returnofdisasterclasshero.com (HTTPS 302)
44. returnofdisasterclasshero.zombie100.com (HTTPS 200)
45. returnofthesssclassranker.com (HTTPS 301)
46. shibamanga.com (HTTPS 200)
47. solofarming-inthetower.online (HTTPS 301)
48. thekingofcave.com (HTTPS 403) - Note: Returns 403 but is accessible
49. theplayerthatcantlevelup.com (HTTPS 302)
50. toonclash.com (HTTPS 403) - Note: Returns 403 but is accessible
51. topmanhua.com (HTTPS 302)
52. transcensionacademy.com (HTTPS 200)
53. void-scans.com (HTTPS 301)
54. w1.reincarnator.online (HTTPS 302)
55. w27.secondliferanker.com (HTTPS 301)
56. w45.secondliferanker.com (HTTPS 301)
57. w47.readnanomachine.com (HTTPS 301)
58. w49.bug-player.com (HTTPS 302)
59. w6.secondliferanker.com (HTTPS 301)
60. w61.readnanomachine.com (HTTPS 200)
61. w9.secondliferanker.com (HTTPS 301)
62. ww1.everyoneregressedexceptme.com (HTTPS 200)
63. ww8.mangakakalot.tv (HTTP 302)
64. www.fansmtl.com (HTTPS 301)
65. www.indiegogo.com (HTTPS 403) - Note: Returns 403 but is accessible
66. www.lightnovelpub.com (HTTPS 403) - Note: Returns 403 but is accessible
67. www.mangageko.com (HTTPS 301)
68. www.mangarise.com (HTTPS 200)
69. www.mangaupdates.com (HTTPS 200)
70. www.mgeko.cc (HTTPS 200)
71. www.mgeko.com (HTTP 302)
72. www.royalroad.com (HTTPS 302)
73. www.scribd.com (HTTPS 200)
74. www.toongod.org (HTTPS 403) - Note: Returns 403 but is accessible
75. www.webnovel.com (HTTPS 403) - Note: Returns 403 but is accessible
76. www.webnovelworld.org (HTTPS 200)
77. www.wuxiaworld.com (HTTPS 200)
78. wwww.sololevelmaxnewbie.com (HTTPS 302)

VALID DNS BUT INACCESSIBLE WEBSITE (3 domains)
===============================================
These domains have valid DNS but don't respond to HTTP/HTTPS requests within timeout:

1. chapmanganato.to - Timeout
2. mangakakalot.com - Timeout
3. thedarkmagesreturntoenlistment.online - Timeout

INVALID DNS (6 domains)
========================
These domains don't have valid DNS records:

1. chapmanganelo.com - DNS error: ESERVFAIL
2. hyperluckmanga.com - DNS error: ENOTFOUND
3. mangahasu.me - DNS error: ESERVFAIL
4. mangahasu.se - DNS error: ESERVFAIL
5. solo-max.online - DNS error: ENOTFOUND
6. ww.mangadex.tv - DNS error: ENOTFOUND

NOTES
=====
- Domains returning 403 (Forbidden) or 405 (Method Not Allowed) are still considered
  "accessible" as they respond to requests, even if they block access or disallow HEAD requests.
- Timeout errors suggest the server may be down, blocking HEAD requests, or very slow.
- DNS errors (ENOTFOUND, ESERVFAIL) indicate the domain no longer exists or has DNS issues.

```

## Summary

- Total unique domains found: 87
- Domains with valid DNS: 81 (93.1%)
- Domains with accessible websites: 78 (89.7%)
- Domains with invalid DNS: 6 (6.9%)
- Domains with inaccessible websites: 9 (10.3%)

## Key findings

**Working domains (78):**
- Most domains are accessible and respond to HTTP/HTTPS requests
- Some return 403 (Forbidden) or 405 (Method Not Allowed) but still respond, indicating they're up but may block HEAD requests or require specific methods

**Valid DNS but inaccessible (3):**
- `chapmanganato.to` — Timeout
- `mangakakalot.com` — Timeout
- `thedarkmagesreturntoenlistment.online` — Timeout

**Invalid DNS (6):**
- `chapmanganelo.com` — DNS error
- `hyperluckmanga.com` — Domain not found
- `mangahasu.me` — DNS error
- `mangahasu.se` — DNS error
- `solo-max.online` — Domain not found
- `ww.mangadex.tv` — Domain not found

Created:
1. `check-domains.js` — Script to check domains (can be reused)
2. `domain-check-results.txt` — Detailed report with all results

The script checks DNS resolution and attempts HTTP/HTTPS connections to verify website accessibility. Domains returning 403/405 are marked accessible since the server responds (even if access is blocked).

---

**User**

Remove all of the URLs matching domains that failed from @reading-list.txt 

---

**Cursor**

Removing URLs for domains that failed DNS or accessibility checks. Reading the file and filtering out those domains:


Creating a script to filter out URLs from failed domains:


```javascript
import fs from 'fs-extra';
import { URL } from 'url';

const READING_LIST_PATH = './reading-list.txt';

// Failed domains from the check
const FAILED_DOMAINS = [
  // Invalid DNS
  'chapmanganelo.com',
  'hyperluckmanga.com',
  'mangahasu.me',
  'mangahasu.se',
  'solo-max.online',
  'ww.mangadex.tv',
  // Valid DNS but inaccessible
  'chapmanganato.to',
  'mangakakalot.com',
  'thedarkmagesreturntoenlistment.online'
];

function extractDomain(urlString) {
  try {
    const url = new URL(urlString);
    return url.hostname;
  } catch (error) {
    return null;
  }
}

async function main() {
  console.log('Reading URLs from reading-list.txt...\n');
  
  // Read file
  const fileContent = await fs.readFile(READING_LIST_PATH, 'utf-8');
  const lines = fileContent.split(/\r?\n/);
  
  console.log(`Total lines: ${lines.length}`);
  
  const filteredLines = [];
  let removedCount = 0;
  
  for (const line of lines) {
    const trimmedLine = line.trim();
    
    // Keep empty lines as-is
    if (!trimmedLine) {
      filteredLines.push(line);
      continue;
    }
    
    // Check if URL belongs to a failed domain
    const domain = extractDomain(trimmedLine);
    if (domain && FAILED_DOMAINS.includes(domain)) {
      console.log(`Removing: ${trimmedLine} (domain: ${domain})`);
      removedCount++;
      continue; // Skip this line
    }
    
    // Keep the line
    filteredLines.push(line);
  }
  
  // Write filtered content back
  const filteredContent = filteredLines.join('\n');
  await fs.writeFile(READING_LIST_PATH, filteredContent, 'utf-8');
  
  console.log(`\nRemoved ${removedCount} URLs from failed domains.`);
  console.log(`Remaining lines: ${filteredLines.length}`);
}

main().catch(console.error);

```

Running the script to remove URLs from failed domains:


Removed 49 URLs from failed domains. Verifying the file was updated correctly:


Checking that none of the failed domains remain in the file:


All failed domains have been removed. Summary:

## Summary

Removed 49 URLs from `reading-list.txt` that matched domains that failed the DNS/accessibility checks:

**Removed domains:**
- `chapmanganato.to` - 16 URLs (timeout)
- `mangakakalot.com` - 18 URLs (timeout)
- `chapmanganelo.com` - 3 URLs (invalid DNS)
- `hyperluckmanga.com` - 2 URLs (invalid DNS)
- `mangahasu.me` - 1 URL (invalid DNS)
- `mangahasu.se` - 4 URLs (invalid DNS)
- `solo-max.online` - 1 URL (invalid DNS)
- `thedarkmagesreturntoenlistment.online` - 1 URL (timeout)
- `ww.mangadex.tv` - 3 URLs (invalid DNS)

**Results:**
- Original file: 429 lines (428 URLs + 1 empty line)
- Updated file: 379 lines (378 URLs + 1 empty line)
- Removed: 49 URLs

All failed domains have been removed from the file. The remaining URLs are from domains that have valid DNS and are accessible.

Should I also clean up the temporary scripts I created (`check-domains.js` and `filter-failed-domains.js`), or keep them for future use?

---

**User**

Cleanup the temporary scripts

---

**Cursor**

Removing the temporary scripts.


Removed both temporary scripts:
- `check-domains.js` — deleted
- `filter-failed-domains.js` — deleted

Cleanup complete. The `reading-list.txt` file has been updated with all failed domain URLs removed, and the temporary scripts have been cleaned up.

---

**User**

@content/root-sites.json Extract the list of domains from this file. For each of the unique domains, check the DNS and browser access. For each domain that fails, remove the site record from this file.

---

**Cursor**

Creating a script to check domains in `root-sites.json` and remove entries for failed domains:


```javascript
import fs from 'fs-extra';
import dns from 'dns/promises';
import https from 'https';
import http from 'http';

const ROOT_SITES_PATH = './content/root-sites.json';

// Check DNS resolution
async function checkDNS(domain) {
  try {
    await dns.resolve4(domain);
    return { valid: true, error: null };
  } catch (error) {
    // Try IPv6 as fallback
    try {
      await dns.resolve6(domain);
      return { valid: true, error: null };
    } catch (error6) {
      return { valid: false, error: error.message };
    }
  }
}

// Check if website is accessible
async function checkWebsite(domain) {
  return new Promise((resolve) => {
    const options = {
      hostname: domain,
      port: 443,
      path: '/',
      method: 'HEAD',
      timeout: 5000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; DomainChecker/1.0)'
      }
    };

    const req = https.request(options, (res) => {
      resolve({ 
        accessible: true, 
        statusCode: res.statusCode,
        error: null 
      });
      res.destroy();
    });

    req.on('error', (error) => {
      // Try HTTP as fallback
      const httpOptions = {
        hostname: domain,
        port: 80,
        path: '/',
        method: 'HEAD',
        timeout: 5000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; DomainChecker/1.0)'
        }
      };

      const httpReq = http.request(httpOptions, (res) => {
        resolve({ 
          accessible: true, 
          statusCode: res.statusCode,
          error: null,
          httpOnly: true
        });
        res.destroy();
      });

      httpReq.on('error', (httpError) => {
        resolve({ 
          accessible: false, 
          statusCode: null,
          error: error.message 
        });
      });

      httpReq.on('timeout', () => {
        httpReq.destroy();
        resolve({ 
          accessible: false, 
          statusCode: null,
          error: 'Timeout' 
        });
      });

      httpReq.setTimeout(5000);
      httpReq.end();
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ 
        accessible: false, 
        statusCode: null,
        error: 'Timeout' 
      });
    });

    req.setTimeout(5000);
    req.end();
  });
}

async function main() {
  console.log('Reading root-sites.json...\n');
  
  // Read JSON file
  const data = await fs.readJson(ROOT_SITES_PATH);
  const sites = data.sites || [];
  
  console.log(`Found ${sites.length} site records\n`);
  console.log('='.repeat(80));
  console.log('Checking domains...\n');

  const validSites = [];
  const failedSites = [];
  let processed = 0;

  for (const site of sites) {
    const { domain, description } = site;
    process.stdout.write(`Checking ${domain}... `);
    
    // Check DNS
    const dnsResult = await checkDNS(domain);
    
    if (dnsResult.valid) {
      // Check website accessibility
      const websiteResult = await checkWebsite(domain);
      
      if (websiteResult.accessible) {
        const protocol = websiteResult.httpOnly ? 'HTTP' : 'HTTPS';
        const status = websiteResult.statusCode || 'OK';
        console.log(`✓ DNS: ✓, Website: ✓ (${protocol} ${status})`);
        validSites.push(site);
      } else {
        console.log(`✓ DNS: ✓, Website: ✗ (${websiteResult.error || 'Not accessible'})`);
        failedSites.push({ site, reason: `Website not accessible: ${websiteResult.error || 'Timeout'}` });
      }
    } else {
      console.log(`✗ DNS: ✗ (${dnsResult.error})`);
      failedSites.push({ site, reason: `Invalid DNS: ${dnsResult.error}` });
    }

    processed++;
    // Small delay to avoid overwhelming servers
    if (processed < sites.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('\nSUMMARY\n');
  
  console.log(`Total sites: ${sites.length}`);
  console.log(`Valid sites: ${validSites.length}`);
  console.log(`Failed sites: ${failedSites.length}`);

  if (failedSites.length > 0) {
    console.log('\n' + '='.repeat(80));
    console.log('\nFAILED SITES (will be removed):\n');
    failedSites.forEach(({ site, reason }) => {
      console.log(`  - ${site.domain} (${reason})`);
    });
  }

  // Update JSON file with only valid sites
  data.sites = validSites;
  await fs.writeJson(ROOT_SITES_PATH, data, { spaces: 2 });

  console.log('\n' + '='.repeat(80));
  console.log(`\n✓ Updated root-sites.json: Removed ${failedSites.length} failed site(s), kept ${validSites.length} valid site(s)`);
}

main().catch(console.error);

```

Running the script to check all domains and remove failed entries:


Verifying the file was updated correctly and then cleaning up the temporary script:


Verifying the JSON structure is correct:


Completed domain checks and removed failed entries from `root-sites.json`.

## Summary

**Results:**
- Original sites: 89
- Valid sites (kept): 80
- Failed sites (removed): 9

**Removed domains:**
1. `chapmanganato.to` - Website timeout
2. `chapmanganelo.com` - Invalid DNS (ESERVFAIL)
3. `hyperluckmanga.com` - Invalid DNS (ENOTFOUND)
4. `mangahasu.me` - Invalid DNS (ESERVFAIL)
5. `mangahasu.se` - Invalid DNS (ESERVFAIL)
6. `mangakakalot.com` - Website timeout
7. `solo-max.online` - Invalid DNS (ENOTFOUND)
8. `thedarkmagesreturntoenlistment.online` - Website timeout
9. `ww.mangadex.tv` - Invalid DNS (ENOTFOUND)

The `root-sites.json` file has been updated with only the 80 valid sites that have working DNS and accessible websites. All failed domains have been verified as removed, and the JSON structure is valid. The temporary script has been cleaned up.

