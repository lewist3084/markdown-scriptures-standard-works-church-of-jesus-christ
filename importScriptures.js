// importScriptures.js

const admin = require('firebase-admin');
const fs    = require('fs');
const path  = require('path');

// Load your service‐account JSON via the env var you exported earlier
const serviceAccount = require(process.env.GOOGLE_APPLICATION_CREDENTIALS);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
const db = admin.firestore();

async function importWork(workDir) {
  // Name of the “resource” (e.g. “Book of Mormon”)
  const resourceName = path.basename(workDir);
  const resRef = await db.collection('resource').add({ name: resourceName });

  // Find all book folders (e.g. “01 1 Nephi”, “02 2 Nephi”, …)
  const bookFolders = fs
    .readdirSync(workDir)
    .filter(name => fs.statSync(path.join(workDir, name)).isDirectory())
    .sort();

  for (const bookFolder of bookFolders) {
    const bookPath = path.join(workDir, bookFolder);
    const position = parseInt(bookFolder, 10);
    const name     = bookFolder.replace(/^\d+\s*/, '');
    const bookRef  = await db.collection('resourceBook').add({
      resourceRef: resRef,    // DocumentReference to the parent resource
      position,
      name,
    });

    // Only include files ending in "<digits>.md"
    const mdFiles = fs
      .readdirSync(bookPath)
      .filter(f => /(\d+)\.md$/.test(f))
      .sort();

    for (const fn of mdFiles) {
      const [, chapterStr] = fn.match(/(\d+)\.md$/);
      const chapNum        = parseInt(chapterStr, 10);

      const chapRef = await db.collection('resourceChapter').add({
        resourceRef:     resRef,   // DocumentReference to the parent resource
        resourceBookRef: bookRef,  // DocumentReference to the parent book
        position:       chapNum,
        name:           `Chapter ${chapNum}`,
        description:    '',
      });

      // Read the markdown and split out verses by headings like "## 1. ..."
      const text    = fs.readFileSync(path.join(bookPath, fn), 'utf8');
      const verseRe = /##\s*(\d+)\.\s*([\s\S]*?)(?=(?:##\s*\d+\.|\Z))/gm;
      let m;
      while ((m = verseRe.exec(text)) !== null) {
        await db.collection('resourceParagraph').add({
          resourceRef:        resRef,   // DocumentReference to the resource
          resourceBookRef:    bookRef,  // DocumentReference to the book
          resourceChapterRef: chapRef,  // DocumentReference to the chapter
          position:           parseInt(m[1], 10),
          content:            m[2].trim(),
        });
      }
    }
  }
}

(async () => {
  // List the folders to import exactly as they appear on disk
  const works = [
    // 'Book of Mormon',
    'Doctrine and Covenants',
    'JST New Testament',
    'JST Old Testament',
    'New Testament',
    'Old Testament',
    'Pearl of Great Price'
  ];

  for (const work of works) {
    console.log(`Importing ${work}…`);
    await importWork(path.join(__dirname, work));
    console.log(`✅ ${work} imported`);
  }

  process.exit(0);
})();
