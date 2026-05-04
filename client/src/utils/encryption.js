export const encryptFile = async (file) => {
  const key = crypto.getRandomValues(new Uint8Array(32));

  const buffer = await file.arrayBuffer();

  const cryptoKey = await window.crypto.subtle.importKey(
    "raw",
    key,
    "AES-GCM",
    false,
    ["encrypt"]
  );

  const iv = crypto.getRandomValues(new Uint8Array(12));

  const encrypted = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    cryptoKey,
    buffer
  );

  return {
    encryptedBlob: new Blob([encrypted]),
    key,
    iv
  };
};




