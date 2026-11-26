/**
 * يحوّل رابط صورة أو فيديو إلى مسار ملف داخل مستودع GitHub إذا كان تابعاً له.
 * يعيد null إذا كان رابطاً خارجياً أو فارغاً.
 */
function extractRepoFilePath(url, owner, repo, branch = 'main') {
  if (!url || typeof url !== 'string') return null;
  const clean = url.trim().split('?')[0].split('#')[0];
  if (!clean || clean.startsWith('data:') || clean.startsWith('blob:')) return null;

  // مسار نسبي مباشر مثل: uploads/story1.jpg أو images/p1.png
  if (!/^https?:\/\//i.test(clean)) {
    return clean.replace(/^\/+/, '');
  }

  try {
    const u = new URL(clean);
    const path = decodeURIComponent(u.pathname).replace(/^\/+/, '');

    // روابط raw.githubusercontent.com/<owner>/<repo>/<branch>/<filepath>
    if (u.hostname === 'raw.githubusercontent.com') {
      const prefix = `${owner}/${repo}/${branch}/`;
      if (path.startsWith(prefix)) return path.slice(prefix.length);
      const altPrefix = `${owner}/${repo}/`;
      if (path.startsWith(altPrefix)) {
        const parts = path.slice(altPrefix.length).split('/');
        parts.shift(); // إزالة اسم الفرع
        return parts.join('/');
      }
    }

    // روابط GitHub Pages مثل: https://<owner>.github.io/<repo>/<filepath>
    if (u.hostname.endsWith('.github.io')) {
      const repoPrefix = `${repo}/`;
      if (path.startsWith(repoPrefix)) return path.slice(repoPrefix.length);
      if (u.hostname === `${owner.toLowerCase()}.github.io`) return path;
    }

    // روابط github.com/<owner>/<repo>/blob/<branch>/<filepath>
    if (u.hostname === 'github.com') {
      const blobPrefix = `${owner}/${repo}/blob/${branch}/`;
      if (path.startsWith(blobPrefix)) return path.slice(blobPrefix.length);
    }
  } catch (_) {}

  return null;
}

/**
 * يجمع كل مسارات الصور/الوسائط المستخدمة حالياً في المنتجات والستوريات
 */
function collectAllUsedMediaPaths(data = {}, stories = [], cfg = {}) {
  const used = new Set();
  const { owner, repo, branch = 'main' } = cfg;

  const addUrl = (val) => {
    const p = extractRepoFilePath(val, owner, repo, branch);
    if (p) used.add(p);
  };

  // منتجات المتجر وأنواعها
  (data.products || []).forEach(prod => {
    addUrl(prod?.image);
    if (Array.isArray(prod?.images)) prod.images.forEach(addUrl);
    (prod?.variants || []).forEach(v => {
      addUrl(v?.image);
    });
  });

  // الستوريات وشرائحها
  (stories || []).forEach(st => {
    addUrl(st?.cover);
    addUrl(st?.image);
    (st?.slides || []).forEach(sl => {
      addUrl(sl?.media);
      addUrl(sl?.image);
      addUrl(sl?.poster);
    });
  });

  return used;
}

/**
 * يحذف ملفاً واحداً من مستودع GitHub بعد جلب sha الخاص به
 */
async function deleteFileFromGitHub(filePath, cfg, commitMessage = 'Delete unused media') {
  const { owner, repo, branch = 'main', token } = cfg;
  if (!filePath || !owner || !repo || !token) return false;

  const encodedPath = filePath.split('/').map(encodeURIComponent).join('/');
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`;

  const headers = {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github+json'
  };

  const getRes = await fetch(apiUrl, { headers });
  if (getRes.status === 404) return true; // الملف غير موجود أصلاً
  if (!getRes.ok) {
    throw new Error(`تعذر قراءة بيانات الملف (${filePath}): ${getRes.status}`);
  }

  const fileMeta = await getRes.json();
  if (!fileMeta?.sha) return false;

  const delUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}`;
  const delRes = await fetch(delUrl, {
    method: 'DELETE',
    headers: {
      ...headers,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      message: commitMessage,
      sha: fileMeta.sha,
      branch
    })
  });

  if (!delRes.ok && delRes.status !== 404) {
    throw new Error(`فشل حذف الملف (${filePath}): ${delRes.status}`);
  }
  return true;
}

/**
 * يحذف الملفات التي كانت مستخدمة سابقاً وأصبحت غير مستخدمة الآن
 */
async function deleteUnusedMediaFiles(previousUsedPaths, currentData, currentStories, cfg) {
  const stillUsed = collectAllUsedMediaPaths(currentData, currentStories, cfg);
  const toDelete = [...previousUsedPaths].filter(p => !stillUsed.has(p));

  const deleted = [];
  const failed = [];

  for (const filePath of toDelete) {
    try {
      await deleteFileFromGitHub(filePath, cfg, `Remove unused media: ${filePath}`);
      deleted.push(filePath);
    } catch (err) {
      console.error(err);
      failed.push(filePath);
    }
  }

  return { deleted, failed };
}
