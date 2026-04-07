function normalizeRawUrl(value) {
  return String(value || '').trim().replace(/\/$/, '');
}

function isPrivateIpv4(hostname) {
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
    return false;
  }

  const parts = hostname.split('.').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }

  if (parts[0] === 10) {
    return true;
  }

  if (parts[0] === 127) {
    return true;
  }

  if (parts[0] === 192 && parts[1] === 168) {
    return true;
  }

  return parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31;
}

function shouldKeepHttp(url) {
  const hostname = String(url.hostname || '').toLowerCase();
  return (
    hostname === 'localhost' ||
    hostname === '::1' ||
    hostname.endsWith('.local') ||
    isPrivateIpv4(hostname)
  );
}

function normalizeServerUrl(value) {
  const raw = normalizeRawUrl(value);
  if (!raw) {
    return '';
  }

  let parsed;
  try {
    parsed = new URL(raw);
  } catch (_error) {
    return raw;
  }

  if (parsed.protocol === 'http:' && !shouldKeepHttp(parsed)) {
    parsed.protocol = 'https:';
  }

  return parsed.toString().replace(/\/$/, '');
}

function getPreferredSocketUrl(value) {
  return normalizeServerUrl(value);
}

module.exports = {
  getPreferredSocketUrl,
  normalizeServerUrl,
};
