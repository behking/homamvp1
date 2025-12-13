# HOMA: Transparent Charity Gaming Platform

![Homa Banner](public/image.png)

**Homa** is a decentralized "Play-to-Give" platform built on the **Soneium Minato Testnet**. It gamifies the donation process, making charity transparent, engaging, and rewarding.

> **Mission:** To bridge the gap between casual gaming and philanthropic impact using blockchain transparency on Soneium L2.

---

## 🌟 Key Features

* **🎮 Multi-Game Ecosystem:** Play addictive mini-games like *Homa Runner*, *Neon Tetris*, and *Snake*.
* **💎 Transparent Donations:** All donations are processed on-chain via Soneium L2, ensuring 100% traceability.
* **🏆 Gamified Rewards:**
    * **Lottery System:** 30% of non-direct donations go into a prize pool distributed to random donors.
    * **Leaderboards:** Compete for the top donor spot globally or per round.
    * **On-Chain Stats:** Your game scores and levels are verifiable on-chain via Game Adapters.
* **⚡ Micro-Transactions:** Uses **Soneium's** low gas fees to allow donations as small as $0.10.
* **📱 Mobile-First Design:** Fully optimized for Farcaster Frames and Telegram Mini Apps.

---

## 🏗️ Architecture

The platform consists of a React frontend and a set of modular smart contracts:

1.  **HomaCore (V7):** The central brain. Handles fund distribution (Charity/Lottery/Treasury), project management, and lottery execution.
2.  **HomaGameAdapter:** A universal adapter that verifies game data (Score, Level) and stores player statistics on-chain permanently.
3.  **HomaIdentity:** (In Development) Manages user reputation and Soulbound badges.

---

## 🚀 Deployed Contracts (Soneium Minato)

| Contract | Address |
| :--- | :--- |
| **HomaCore** | [`0xb81D49b47486611323Ac6C6fE09CD18E481d2A92`](https://explorer-testnet.soneium.org/address/0xb81D49b47486611323Ac6C6fE09CD18E481d2A92) |
| **Game Adapter** | [`0x05FE577483E3e3F2442719a8B08D04583584B7Cb`](https://explorer-testnet.soneium.org/address/0x05FE577483E3e3F2442719a8B08D04583584B7Cb) |
| **Network** | Soneium Minato Testnet (Chain ID: 1946) |

---

## 🎮 Game Mechanics

### 1. Homa Runner
An infinite runner where you collect bricks to build schools.
* **Controls:** Tap/Space to Jump.
* **Impact:** Donations revive your character and save your high score on-chain.

### 2. Neon Tetris
A modern take on the classic puzzle with DeFi power-ups.
* **Power-ups:** Pay small donations to Freeze Time, Blast Lines (TNT), or unlock Future Sight.
* **Controls:** Mobile-optimized swipe gestures.

### 3. Homa Snake
Classic snake mechanics with a neon aesthetic.
* **Controls:** D-Pad or Swipe modes.
* **Collectibles:** Gather Apples, Gems, and Coins to boost your score.

---

## 🛠️ Tech Stack

* **Frontend:** React 18, TypeScript, Vite
* **Styling:** Tailwind CSS, Custom CSS Variables (Glassmorphism)
* **Web3 Integration:** Wagmi, Viem, Reown (WalletConnect)
* **Smart Contracts:** Solidity (v0.8.20)
* **Chain:** Soneium Minato (Sony L2)

---

## 🕹️ How to Run Locally

Follow these steps to set up the project on your local machine:

1.  **Clone the repository:**
    ```bash
    git clone [https://github.com/behking/homamvp1.git](https://github.com/behking/homamvp1.git)
    cd homamvp1
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    # Note: Using legacy-peer-deps might be required for some wagmi versions
    npm install --legacy-peer-deps
    ```

3.  **Start the development server:**
    ```bash
    npm run dev
    ```

4.  Open your browser at `http://localhost:5173`.

---

## 🗺️ Roadmap

### ✅ Phase 1: Foundation (Completed)
- [x] MVP Deployment on Soneium Minato Testnet.
- [x] Modular Smart Contract Architecture (Core + Adapters).
- [x] Development of 3 Proof-of-Concept Games (Runner, Snake, Tetris).
- [x] Farcaster Frame & Mini-App Integration.

### 📚 Phase 2: Education & Empowerment (Next Step)
- [ ] **Mainnet Launch:** Deploying Homa Core on Soneium Mainnet.
- [ ] **Supporting Working Children:** Partnering with NGOs to fund education for child laborers.
- [ ] **School Equipment:** Crowdfunding for classroom supplies, tablets, and renovation of existing schools.
- [ ] **Community Building:** Establishing a donor base passionate about education.

### 🎮 Phase 3: The Super App Ecosystem
- [ ] **Mini-Game Aggregation:** Launching 10+ independent mini-games as "Mini-Apps" within the Startale ecosystem.
- [ ] **Unified Profile:** A single donor identity across all games.
- [ ] **Engagement Loops:** Daily quests and challenges to boost micro-donations.

### 🏗️ Phase 4: Homa Core as Infrastructure
- [ ] **External Integration:** Releasing APIs/SDKs for *other* apps (non-games) to use Homa Core.
- [ ] **Donation-as-a-Service:** Allowing any dApp or wallet to plug into Homa's transparent charity flow.
- [ ] **Cross-Chain Support:** accepting donations from other L2 networks.

### 🏫 Phase 5: Major Construction (The Ultimate Goal)
- [ ] **Building Schools:** Fully funding and constructing new smart schools in deprived areas.
- [ ] **Infrastructure Projects:** Large-scale educational facilities (Libraries, Labs).
- [ ] **Global Impact:** Expanding the model to support education worldwide.

---

## 📄 License

This project is licensed under the MIT License.

---

*Built with ❤️ for the Soneium ecosystem.*