import { http, createConfig } from "wagmi";
import { injected } from "wagmi/connectors";

// Soneium Minato Testnet
export const soneiumMinato = {
  id: 1946,
  name: 'Soneium Minato',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.minato.soneium.org'] },
  },
  blockExplorers: {
    default: { name: 'Soneium Minato Explorer', url: 'https://soneium-minato.blockscout.com' },
  },
  testnet: true,
} as const;

export const config = createConfig({
  chains: [soneiumMinato],
  connectors: [
    injected(),
  ],
  transports: {
    [soneiumMinato.id]: http(),
  },
});

// // ---- اضافه کردن تابع کمکی برای سوییچ شبکه ----
// export const switchToSoneium = async (): Promise<boolean> => {
//   if (!window.ethereum) {
//     alert("لطفاً یک کیف پول مثل MetaMask نصب کنید.");
//     return false;
//   }

//   try {
//     await window.ethereum.request({
//       method: "wallet_switchEthereumChain",
//       params: [{ chainId: "0x792" }], // 1946 در هگز
//     });
//     return true;
//   } catch (switchError: any) {
//     if (switchError.code === 4902) {
//       try {
//         await window.ethereum.request({
//           method: "wallet_addEthereumChain",
//           params: [{
//             chainId: "0x792",
//             chainName: soneiumMinato.name,
//             rpcUrls: soneiumMinato.rpcUrls.default.http,
//             nativeCurrency: soneiumMinato.nativeCurrency,
//             blockExplorerUrls: [soneiumMinato.blockExplorers.default.url],
//           }],
//         });
//         return true;
//       } catch (addError) {
//         console.error("خطا در اضافه کردن شبکه:", addError);
//         return false;
//       }
//     } else {
//       console.error("خطا در تغییر شبکه:", switchError);
