# Ship Stack to the App Store

You need a **Mac**, **Xcode 26**, and an [Apple Developer](https://developer.apple.com) account ($99/year).

The game is bundled **inside** the app. It does not load a website.

## 1. One-time on your Mac

```bash
git clone https://github.com/raymarkbunga1829/stack-tetris.git
cd stack-tetris
npm install
npm run cap:sync
npm run cap:open
```

That opens the `ios` project in Xcode.

In Xcode:

1. Select the **App** target → **Signing & Capabilities**
2. Team: your Apple ID
3. Bundle ID must stay **`app.stack.play`** (or change it in `capacitor.config.ts` and run `npm run cap:sync` again)
4. Add capability **In-App Purchase**
5. Drag `ios-resources/PrivacyInfo.xcprivacy` into the App target (copy items if needed)

## 2. Products in App Store Connect

Create these **consumable** IAPs. IDs must match exactly:

| Product ID | Price |
| --- | --- |
| `app.stack.play.credits_s` | $0.99 |
| `app.stack.play.credits_m` | $2.99 |
| `app.stack.play.credits_l` | $6.99 |
| `app.stack.play.pack_ops` | $4.99 |
| `app.stack.play.theme_night` | $0.99 |

Paid Apps Agreement must be active, and banking / tax filled in, or StoreKit returns nothing.

Local testing: open `ios-resources/Stack.storekit` in Xcode (**Product → Scheme → Edit Scheme → Run → Options → StoreKit Configuration**).

## 3. Icons and screenshots

- App icon 1024×1024 (no alpha)
- Splash is already dark `#0c0d10`
- App Store screenshots from an iPhone 16 / 6.7" simulator

Do **not** name the listing “Tetris”. “Stack” is fine.

## 4. TestFlight then submit

1. Xcode → **Any iOS Device (arm64)** → **Product → Archive**
2. Distribute → App Store Connect
3. Internal TestFlight on a real iPhone
4. Submit for review

Review notes to paste:

> Offline stacking game. Tap Play. No account. Store uses StoreKit consumables listed above. Demo: clear a few lines, use Hold and Drop.

## 5. After you change the game

```bash
npm run cap:sync
```

Then archive again in Xcode.

Web preview (`npm run dev`) is unchanged.
