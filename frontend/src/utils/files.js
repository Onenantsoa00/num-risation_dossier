export function formatFileSize(bytes) {
  if (!bytes && bytes !== 0) return "—";
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

export function getFileExtension(name = "") {
  const parts = name.split(".");
  return parts.length > 1 ? parts.pop().toLowerCase() : "";
}

export function getFileKind(name = "") {
  const ext = getFileExtension(name);
  if (["pdf"].includes(ext)) return "pdf";
  if (["png", "jpg", "jpeg", "gif", "webp", "bmp"].includes(ext))
    return "image";
  if (["txt", "csv", "json", "xml", "md", "log"].includes(ext)) return "text";
  if (["zip"].includes(ext)) return "zip";
  if (["doc", "docx"].includes(ext)) return "word";
  if (["xls", "xlsx"].includes(ext)) return "excel";
  return "other";
}

export function fileIcon(name = "") {
  const kind = getFileKind(name);
  return {
    pdf: "picture_as_pdf",
    image: "image",
    text: "description",
    zip: "folder_zip",
    word: "article",
    excel: "table_chart",
    other: "insert_drive_file",
  }[kind];
}

export function isPreviewable(name = "") {
  return ["pdf", "image", "text"].includes(getFileKind(name));
}

export function getImageUrl(image) {
  if (!image) return null;

  // Si le backend fournit déjà une URL complète
  if (/^https?:\/\//i.test(image)) {
    return image;
  }

  // Nettoyage pour éviter // entre le port et /uploads
  const path = image.startsWith("/") ? image : `/${image}`;

  // Utilise automatiquement le nom/adresse du serveur
  return `http://${window.location.hostname}:3000${path}`;
}
