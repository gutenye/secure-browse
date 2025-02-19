import { Management, Tabs } from 'wxt/browser'
import { isDangerExt } from './utils/isDanger'
import { matchesPattern } from './utils/matchesPattern'

interface WetInfo {
  name: string
  id: string
}

interface SiteInfo {
  match: string
  examples?: string[]
}

interface Config {
  whiteExtList: WetInfo[]
  financialSites: SiteInfo[]
}

export const config: Config = {
  whiteExtList: [
    {
      name: 'uBlock Origin',
      id: 'cjpalhdlnbpafiamejdnhcphjbkeiagm',
    },
  ],
  financialSites: [
    {
      match: '*://*.binance.com/*',
      examples: [
        'https://www.binance.com/en/trade/BTC_USDT',
        'https://www.binance.com/en/trade/ETH_BTC',
      ],
    },
    { match: '*://*.coinbase.com/*', examples: ['https://www.coinbase.com/'] },
    { match: '*://*.kraken.com/*', examples: ['https://www.kraken.com/'] },
    // ref: https://github.com/Tampermonkey/tampermonkey/blob/07f668cd1cabb2939220045839dec4d95d2db0c8/src/background.js#L2414
    {
      match: '*paypal.com/*',
      examples: ['https://www.paypal.com/', 'https://www.paypal.com/c2/home'],
    },
    {
      match: '*stripe.com/*',
      examples: [
        'https://stripe.com/',
        'https://dashboard.stripe.com/login',
        'https://dashboard.stripe.com/payments',
      ],
    },
    { match: '*://plusone.google.com/*/fastbutton*' },
    { match: '*://platform.twitter.com/widgets/*' },
    { match: 'https://*bankamerica.tld/*' },
    { match: 'https://*deutsche-bank-24.tld/*' },
    { match: 'https://*bankofamerica.tld/*' },
    { match: '*://www.facebook.com/plugins/*' },
  ],
}

const whiteList = config.whiteExtList.map((it) => it.id)

const financialSites = config.financialSites.map((it) => it.match)

let extensionsList: Management.ExtensionInfo[] = []
async function updateExtensionsList() {
  extensionsList = await browser.management.getAll()
}

let disabledExtensions: string[] = []

async function persistData() {
  await browser.storage.local.set({
    disabledExtensions,
  })
}

// Function to disable extensions not in the whitelist
async function disableExtensions() {
  const disableList = extensionsList.filter(
    (it) =>
      !whiteList.includes(it.id) && it.enabled && it.id !== browser.runtime.id,
  )
  if (disableList.length === 0) {
    return
  }
  disabledExtensions = disableList.map((it) => it.id)
  await Promise.all(
    disableList.map(async (it) => {
      await browser.management.setEnabled(it.id, false)
      console.log(`Disabled extension: ${it.name}`)
    }),
  )
  await persistData()
}

// Function to re-enable previously disabled extensions
async function enableExtensions() {
  await Promise.all(
    disabledExtensions.map(async (it) => {
      await browser.management.setEnabled(it, true)
      console.log(`Re-enabled extension: ${it}`)
    }),
  )
  disabledExtensions = []
  await persistData()
}

export default defineBackground(() => {
  async function handleTab(tab: Tabs.Tab) {
    if (tab.url) {
      if (matchesPattern(tab.url, financialSites)) {
        await disableExtensions()
      } else {
        await enableExtensions()
      }
    }
  }

  // Listen for tab updates
  browser.tabs.onUpdated.addListener(async (_tabId, changeInfo, tab) => {
    if (changeInfo.status === 'loading' || changeInfo.status === 'complete') {
      await handleTab(tab)
    }
  })

  // Listen for tab switches
  browser.tabs.onActivated.addListener(async (activeInfo) => {
    const tab = await browser.tabs.get(activeInfo.tabId)
    await handleTab(tab)
  })

  // Listen for extension installation and removal to update the list
  updateExtensionsList()
  browser.management.onInstalled.addListener(updateExtensionsList)
  browser.management.onUninstalled.addListener(updateExtensionsList)
  browser.management.onEnabled.addListener(updateExtensionsList)
  browser.management.onDisabled.addListener(updateExtensionsList)

  // Restore extensions when the extension is reloaded or the browser starts
  browser.runtime.onStartup.addListener(async () => {
    disabledExtensions = ((
      await browser.storage.local.get('disabledExtensions')
    ).disabledExtensions ?? []) as string[]
    await enableExtensions()
  })
  browser.runtime.onInstalled.addListener(async () => {
    await enableExtensions()
  })

  browser.management.onInstalled.addListener(async (info) => {
    if (!isDangerExt(info)) {
      return
    }
    await browser.management.setEnabled(info.id, false)
    await browser.windows.create({
      url: browser.runtime.getURL(`/popup.html?id=${info.id}`),
      type: 'popup',
      width: 400,
      height: 600,
      top: 100,
      focused: true,
    })
  })
})
