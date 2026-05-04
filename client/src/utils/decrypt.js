import forge from "node-forge";

export const decryptFile = (fileData, encryptedKey, iv, privateKeyPem) => {
  try {
    // ✅ FIX: ensure proper PEM format
    if (!privateKeyPem.includes("BEGIN RSA PRIVATE KEY")) {
      throw new Error("Invalid PEM formatted message.");
    }

    const privateKey = forge.pki.privateKeyFromPem(privateKeyPem);

    // 🔐 decrypt AES key
    const decryptedAesKeyBinary = privateKey.decrypt(
      forge.util.decode64(encryptedKey)
    );

    const aesKey = forge.util.createBuffer(decryptedAesKeyBinary, "binary");

    const ivBuffer = forge.util.decode64(iv);
    const encryptedBytes = forge.util.decode64(fileData);

    const decipher = forge.cipher.createDecipher("AES-CBC", aesKey);

    decipher.start({ iv: ivBuffer });
    decipher.update(forge.util.createBuffer(encryptedBytes));
    decipher.finish();

    const bytes = decipher.output.getBytes();

    return new Blob([forge.util.binary.raw.decode(bytes)]);

  } catch (err) {
    console.error("DECRYPT ERROR:", err);
    throw err;
  }
};




