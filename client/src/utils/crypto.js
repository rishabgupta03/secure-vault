
import forge from "node-forge";
export const generateKeyPair=()=>{
  return new Promise(resolve=>{
    forge.pki.rsa.generateKeyPair({bits:2048},(e,k)=>{
      resolve({
        publicKey:forge.pki.publicKeyToPem(k.publicKey),
        privateKey:forge.pki.privateKeyToPem(k.privateKey)
      });
    });
  });
};
