/**
 * PERPX — Centralized Asset & Logo Registry
 *
 * Single source of truth for ALL visual assets: crypto icons, chain logos,
 * country flags, bank logos, payment provider logos.
 *
 * Data sources (all free, no API key needed):
 *   Crypto:   CoinGecko CDN  (https://assets.coingecko.com/coins/images/{id}/small/{file})
 *   Chains:   CoinGecko CDN  (same registry, chain native tokens)
 *   Flags:    flagcdn.com    (https://flagcdn.com/w40/{iso2}.png)
 *   Banks:    clearbit.com logo API (https://logo.clearbit.com/{domain}) + inline SVG fallbacks
 */

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface CryptoAsset {
  symbol: string;          // e.g. "BTC"
  name: string;            // e.g. "Bitcoin"
  coingeckoId: string;     // e.g. "bitcoin" — canonical CoinGecko slug
  coingeckoImageId: number; // numeric image id from CoinGecko CDN
  coingeckoImageFile: string; // filename on CDN
  logoUrl?: string;        // override URL — used when CoinGecko CDN blocks the file
  color: string;           // brand color
  networks: string[];      // chain ids where this token exists
  contractAddresses?: Record<string, string>; // network → contract address
}

export interface ChainAsset {
  id: string;              // e.g. "ethereum"
  name: string;            // e.g. "Ethereum"
  chainId?: number;        // EVM chain ID
  coingeckoId: string;     // native token CoinGecko id
  coingeckoImageId: number;
  coingeckoImageFile: string;
  color: string;
  nativeCurrency: string;  // symbol
  explorerBase?: string;
}

export interface CountryEntry {
  iso2: string;            // e.g. "NG"
  iso3: string;            // e.g. "NGA"
  name: string;            // e.g. "Nigeria"
  currency: string;        // ISO 4217 code, e.g. "NGN"
  currencyName: string;    // e.g. "Nigerian Naira"
  currencySymbol: string;  // e.g. "₦"
  callingCode: string;     // e.g. "+234"
  continent: string;
}

export interface PaymentProvider {
  id: string;
  name: string;
  category: "bank" | "mobile_money" | "wallet" | "gateway" | "card" | "crypto";
  countries: string[];     // ISO2 codes
  logoUrl: string;         // clearbit domain logo or local path
  color: string;
  website: string;
  currencies: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// CRYPTO ASSETS  (CoinGecko CDN)
// URL pattern: https://assets.coingecko.com/coins/images/{imageId}/small/{file}
// ─────────────────────────────────────────────────────────────────────────────

export const CRYPTO_ASSETS: Record<string, CryptoAsset> = {
  BTC:  { symbol:"BTC",  name:"Bitcoin",          coingeckoId:"bitcoin",           coingeckoImageId:1,     coingeckoImageFile:"bitcoin.png",       color:"#f7931a", networks:["bitcoin","ethereum","bsc","arbitrum","optimism","base","polygon"] },
  ETH:  { symbol:"ETH",  name:"Ethereum",         coingeckoId:"ethereum",          coingeckoImageId:279,   coingeckoImageFile:"ethereum.png",      color:"#627eea", networks:["ethereum","arbitrum","optimism","base","polygon"] },
  SOL:  { symbol:"SOL",  name:"Solana",           coingeckoId:"solana",            coingeckoImageId:4128,  coingeckoImageFile:"solana.png",        color:"#9945ff", networks:["solana"] },
  BNB:  { symbol:"BNB",  name:"BNB",              coingeckoId:"binancecoin",       coingeckoImageId:825,   coingeckoImageFile:"bnb-icon2_2x.png",  color:"#f3ba2f", networks:["bsc","ethereum"] },
  XRP:  { symbol:"XRP",  name:"XRP",              coingeckoId:"ripple",            coingeckoImageId:44,    coingeckoImageFile:"xrp-symbol-white-128.png", color:"#00aae4", networks:["xrp"] },
  USDT: { symbol:"USDT", name:"Tether USD",       coingeckoId:"tether",            coingeckoImageId:325,   coingeckoImageFile:"Tether.png",        color:"#26a17b", networks:["ethereum","bsc","tron","solana","polygon","arbitrum","optimism","base","avalanche"] },
  USDC: { symbol:"USDC", name:"USD Coin",         coingeckoId:"usd-coin",          coingeckoImageId:6319,  coingeckoImageFile:"USD_Coin_icon.png", color:"#2775ca", networks:["ethereum","bsc","solana","polygon","arbitrum","optimism","base","avalanche","arc"] },
  DOGE: { symbol:"DOGE", name:"Dogecoin",         coingeckoId:"dogecoin",          coingeckoImageId:5,     coingeckoImageFile:"dogecoin.png",      color:"#c2a633", networks:["dogecoin"] },
  ADA:  { symbol:"ADA",  name:"Cardano",          coingeckoId:"cardano",           coingeckoImageId:975,   coingeckoImageFile:"cardano.png",       color:"#0d1e2d", networks:["cardano"] },
  AVAX: { symbol:"AVAX", name:"Avalanche",        coingeckoId:"avalanche-2",       coingeckoImageId:12559, coingeckoImageFile:"avalanche-avax-logo.png", logoUrl:"https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/avalanchec/info/logo.png", color:"#e84142", networks:["avalanche","ethereum"] },
  LINK: { symbol:"LINK", name:"Chainlink",        coingeckoId:"chainlink",         coingeckoImageId:877,   coingeckoImageFile:"chainlink-new-logo.png", color:"#375bd2", networks:["ethereum","bsc","polygon","arbitrum","avalanche"] },
  DOT:  { symbol:"DOT",  name:"Polkadot",         coingeckoId:"polkadot",          coingeckoImageId:12171, coingeckoImageFile:"polkadot.png",      color:"#e6007a", networks:["polkadot"] },
  LTC:  { symbol:"LTC",  name:"Litecoin",         coingeckoId:"litecoin",          coingeckoImageId:2,     coingeckoImageFile:"litecoin.png",      color:"#bfbbbb", networks:["litecoin"] },
  BCH:  { symbol:"BCH",  name:"Bitcoin Cash",     coingeckoId:"bitcoin-cash",      coingeckoImageId:780,   coingeckoImageFile:"bitcoin-cash.png",  logoUrl:"https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/bitcoincash/info/logo.png", color:"#8dc351", networks:["bitcoin-cash"] },
  SUI:  { symbol:"SUI",  name:"Sui",              coingeckoId:"sui",               coingeckoImageId:26375, coingeckoImageFile:"sui_asset.png",     logoUrl:"https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/sui/info/logo.png", color:"#4da2ff", networks:["sui"] },
  TON:  { symbol:"TON",  name:"Toncoin",          coingeckoId:"the-open-network",  coingeckoImageId:17980, coingeckoImageFile:"ton_symbol.png",    color:"#0088cc", networks:["ton"] },
  NEAR: { symbol:"NEAR", name:"NEAR Protocol",    coingeckoId:"near",              coingeckoImageId:10365, coingeckoImageFile:"near.png",          color:"#00c08b", networks:["near"] },
  APT:  { symbol:"APT",  name:"Aptos",            coingeckoId:"aptos",             coingeckoImageId:26455, coingeckoImageFile:"aptos_round.png",   color:"#00b4d8", networks:["aptos"] },
  ARB:  { symbol:"ARB",  name:"Arbitrum",         coingeckoId:"arbitrum",          coingeckoImageId:16547, coingeckoImageFile:"photo_2023-03-29_21.47.00.jpeg", logoUrl:"https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/arbitrum/info/logo.png", color:"#12aaff", networks:["arbitrum","ethereum"] },
  ARC:  { symbol:"ARC",  name:"Arc",              coingeckoId:"usd-coin",          coingeckoImageId:6319,  coingeckoImageFile:"USD_Coin_icon.png",  color:"#2775ca", networks:["arc"] },
  OP:   { symbol:"OP",   name:"Optimism",         coingeckoId:"optimism",          coingeckoImageId:25244, coingeckoImageFile:"optimism.png",      logoUrl:"https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/optimism/info/logo.png", color:"#ff0420", networks:["optimism","ethereum"] },
  INJ:  { symbol:"INJ",  name:"Injective",        coingeckoId:"injective-protocol",coingeckoImageId:7226,  coingeckoImageFile:"injective-protocol-inj-logo.png", logoUrl:"https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xe28b3B32B6c345A34Ff64674606124Dd5Aceca30/logo.png", color:"#00f2fe", networks:["injective","ethereum"] },
  UNI:  { symbol:"UNI",  name:"Uniswap",          coingeckoId:"uniswap",           coingeckoImageId:12504, coingeckoImageFile:"uniswap-uni-logo.png", logoUrl:"https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984/logo.png", color:"#ff007a", networks:["ethereum","arbitrum","optimism","base","polygon"] },
  AAVE: { symbol:"AAVE", name:"Aave",             coingeckoId:"aave",              coingeckoImageId:12645, coingeckoImageFile:"aave-logo.png",     logoUrl:"https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9/logo.png", color:"#b6509e", networks:["ethereum","polygon","arbitrum","optimism","base","avalanche"] },
  PEPE: { symbol:"PEPE", name:"Pepe",             coingeckoId:"pepe",              coingeckoImageId:29850, coingeckoImageFile:"pepe-token.png",    logoUrl:"https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x6982508145454Ce325dDbE47a25d4ec3d2311933/logo.png", color:"#4caf50", networks:["ethereum"] },
  TRX:  { symbol:"TRX",  name:"TRON",             coingeckoId:"tron",              coingeckoImageId:1094,  coingeckoImageFile:"tron-logo.png",     color:"#eb0029", networks:["tron"] },
  MATIC:{ symbol:"MATIC",name:"Polygon",          coingeckoId:"matic-network",     coingeckoImageId:4713,  coingeckoImageFile:"polygon.png",       color:"#8247e5", networks:["polygon","ethereum"] },
  DAI:  { symbol:"DAI",  name:"Dai",              coingeckoId:"dai",               coingeckoImageId:9956,  coingeckoImageFile:"dai-logo.png",      logoUrl:"https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x6B175474E89094C44Da98b954EedeAC495271d0F/logo.png", color:"#f5ac37", networks:["ethereum","polygon","arbitrum","optimism","base","avalanche"] },
};

/** Get logo URL for a crypto symbol — uses override if present, else CoinGecko CDN */
export function cryptoLogoUrl(symbol: string): string {
  const a = CRYPTO_ASSETS[symbol.toUpperCase()];
  if (!a) return "";
  if (a.logoUrl) return a.logoUrl;
  return `https://assets.coingecko.com/coins/images/${a.coingeckoImageId}/small/${a.coingeckoImageFile}`;
}

/** Get large logo URL (128px) — uses override if present, else CoinGecko large CDN */
export function cryptoLogoLargeUrl(symbol: string): string {
  const a = CRYPTO_ASSETS[symbol.toUpperCase()];
  if (!a) return "";
  if (a.logoUrl) return a.logoUrl;
  return `https://assets.coingecko.com/coins/images/${a.coingeckoImageId}/large/${a.coingeckoImageFile}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// BLOCKCHAIN NETWORK LOGOS  (CoinGecko CDN — native token images)
// ─────────────────────────────────────────────────────────────────────────────

export const CHAINS: Record<string, ChainAsset> = {
  ethereum:  { id:"ethereum",  name:"Ethereum",       chainId:1,     coingeckoId:"ethereum",       coingeckoImageId:279,   coingeckoImageFile:"ethereum.png",         color:"#627eea", nativeCurrency:"ETH",   explorerBase:"https://etherscan.io" },
  arbitrum:  { id:"arbitrum",  name:"Arbitrum One",   chainId:42161, coingeckoId:"ethereum",       coingeckoImageId:16547, coingeckoImageFile:"photo_2023-03-29_21.47.00.jpeg", color:"#12aaff", nativeCurrency:"ETH", explorerBase:"https://arbiscan.io" },
  optimism:  { id:"optimism",  name:"Optimism",       chainId:10,    coingeckoId:"optimism",       coingeckoImageId:25244, coingeckoImageFile:"optimism.png",          color:"#ff0420", nativeCurrency:"ETH",   explorerBase:"https://optimistic.etherscan.io" },
  base:      { id:"base",      name:"Base",           chainId:8453,  coingeckoId:"ethereum",       coingeckoImageId:279,   coingeckoImageFile:"ethereum.png",          color:"#0052ff", nativeCurrency:"ETH",   explorerBase:"https://basescan.org" },
  polygon:   { id:"polygon",   name:"Polygon",        chainId:137,   coingeckoId:"matic-network",  coingeckoImageId:4713,  coingeckoImageFile:"polygon.png",           color:"#8247e5", nativeCurrency:"MATIC", explorerBase:"https://polygonscan.com" },
  bsc:       { id:"bsc",       name:"BNB Smart Chain",chainId:56,    coingeckoId:"binancecoin",    coingeckoImageId:825,   coingeckoImageFile:"bnb-icon2_2x.png",      color:"#f3ba2f", nativeCurrency:"BNB",   explorerBase:"https://bscscan.com" },
  avalanche: { id:"avalanche", name:"Avalanche C-Chain",chainId:43114,coingeckoId:"avalanche-2",  coingeckoImageId:12559, coingeckoImageFile:"avalanche-avax-logo.png",color:"#e84142", nativeCurrency:"AVAX",  explorerBase:"https://snowscan.xyz" },
  solana:    { id:"solana",    name:"Solana",                         coingeckoId:"solana",         coingeckoImageId:4128,  coingeckoImageFile:"solana.png",            color:"#9945ff", nativeCurrency:"SOL",   explorerBase:"https://solscan.io" },
  bitcoin:   { id:"bitcoin",   name:"Bitcoin",                        coingeckoId:"bitcoin",        coingeckoImageId:1,     coingeckoImageFile:"bitcoin.png",           color:"#f7931a", nativeCurrency:"BTC",   explorerBase:"https://mempool.space" },
  tron:      { id:"tron",      name:"TRON",                           coingeckoId:"tron",           coingeckoImageId:1094,  coingeckoImageFile:"tron-logo.png",         color:"#eb0029", nativeCurrency:"TRX",   explorerBase:"https://tronscan.org" },
  arc:       { id:"arc",       name:"Arc",            chainId:5042,  coingeckoId:"usd-coin",       coingeckoImageId:6319,  coingeckoImageFile:"USD_Coin_icon.png",     color:"#2775ca", nativeCurrency:"USDC",  explorerBase:"https://explorer.arc.io" },
  "arc testnet": { id:"arc testnet", name:"Arc Testnet", chainId:5042002, coingeckoId:"usd-coin", coingeckoImageId:6319, coingeckoImageFile:"USD_Coin_icon.png",    color:"#2775ca", nativeCurrency:"USDC",  explorerBase:"https://explorer.testnet.arc.io" },
};

export function chainLogoUrl(chainId: string): string {
  const c = CHAINS[chainId.toLowerCase()];
  if (!c) return "";
  return `https://assets.coingecko.com/coins/images/${c.coingeckoImageId}/small/${c.coingeckoImageFile}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// COUNTRY FLAGS  (flagcdn.com — free, reliable, 250+ countries)
// URL: https://flagcdn.com/w40/{iso2_lowercase}.png
// ─────────────────────────────────────────────────────────────────────────────

export const COUNTRIES: CountryEntry[] = [
  { iso2:"NG", iso3:"NGA", name:"Nigeria",          currency:"NGN", currencyName:"Nigerian Naira",          currencySymbol:"₦",  callingCode:"+234", continent:"Africa" },
  { iso2:"US", iso3:"USA", name:"United States",    currency:"USD", currencyName:"US Dollar",               currencySymbol:"$",  callingCode:"+1",   continent:"Americas" },
  { iso2:"GB", iso3:"GBR", name:"United Kingdom",   currency:"GBP", currencyName:"British Pound",           currencySymbol:"£",  callingCode:"+44",  continent:"Europe" },
  { iso2:"EU", iso3:"EUR", name:"European Union",   currency:"EUR", currencyName:"Euro",                    currencySymbol:"€",  callingCode:"",     continent:"Europe" },
  { iso2:"GH", iso3:"GHA", name:"Ghana",            currency:"GHS", currencyName:"Ghanaian Cedi",           currencySymbol:"₵",  callingCode:"+233", continent:"Africa" },
  { iso2:"KE", iso3:"KEN", name:"Kenya",            currency:"KES", currencyName:"Kenyan Shilling",         currencySymbol:"KSh",callingCode:"+254", continent:"Africa" },
  { iso2:"ZA", iso3:"ZAF", name:"South Africa",     currency:"ZAR", currencyName:"South African Rand",      currencySymbol:"R",  callingCode:"+27",  continent:"Africa" },
  { iso2:"CA", iso3:"CAN", name:"Canada",           currency:"CAD", currencyName:"Canadian Dollar",         currencySymbol:"C$", callingCode:"+1",   continent:"Americas" },
  { iso2:"AU", iso3:"AUS", name:"Australia",        currency:"AUD", currencyName:"Australian Dollar",       currencySymbol:"A$", callingCode:"+61",  continent:"Oceania" },
  { iso2:"IN", iso3:"IND", name:"India",            currency:"INR", currencyName:"Indian Rupee",            currencySymbol:"₹",  callingCode:"+91",  continent:"Asia" },
  { iso2:"AE", iso3:"ARE", name:"UAE",              currency:"AED", currencyName:"UAE Dirham",              currencySymbol:"د.إ",callingCode:"+971", continent:"Asia" },
  { iso2:"BR", iso3:"BRA", name:"Brazil",           currency:"BRL", currencyName:"Brazilian Real",          currencySymbol:"R$", callingCode:"+55",  continent:"Americas" },
  { iso2:"JP", iso3:"JPN", name:"Japan",            currency:"JPY", currencyName:"Japanese Yen",            currencySymbol:"¥",  callingCode:"+81",  continent:"Asia" },
  { iso2:"CN", iso3:"CHN", name:"China",            currency:"CNY", currencyName:"Chinese Yuan",            currencySymbol:"¥",  callingCode:"+86",  continent:"Asia" },
  { iso2:"MX", iso3:"MEX", name:"Mexico",           currency:"MXN", currencyName:"Mexican Peso",            currencySymbol:"$",  callingCode:"+52",  continent:"Americas" },
  { iso2:"SG", iso3:"SGP", name:"Singapore",        currency:"SGD", currencyName:"Singapore Dollar",        currencySymbol:"S$", callingCode:"+65",  continent:"Asia" },
  { iso2:"CH", iso3:"CHE", name:"Switzerland",      currency:"CHF", currencyName:"Swiss Franc",             currencySymbol:"Fr", callingCode:"+41",  continent:"Europe" },
  { iso2:"SE", iso3:"SWE", name:"Sweden",           currency:"SEK", currencyName:"Swedish Krona",           currencySymbol:"kr", callingCode:"+46",  continent:"Europe" },
  { iso2:"TZ", iso3:"TZA", name:"Tanzania",         currency:"TZS", currencyName:"Tanzanian Shilling",      currencySymbol:"TSh",callingCode:"+255", continent:"Africa" },
  { iso2:"UG", iso3:"UGA", name:"Uganda",           currency:"UGX", currencyName:"Ugandan Shilling",        currencySymbol:"USh",callingCode:"+256", continent:"Africa" },
  { iso2:"ET", iso3:"ETH", name:"Ethiopia",         currency:"ETB", currencyName:"Ethiopian Birr",          currencySymbol:"Br", callingCode:"+251", continent:"Africa" },
  { iso2:"EG", iso3:"EGY", name:"Egypt",            currency:"EGP", currencyName:"Egyptian Pound",          currencySymbol:"£",  callingCode:"+20",  continent:"Africa" },
  { iso2:"MA", iso3:"MAR", name:"Morocco",          currency:"MAD", currencyName:"Moroccan Dirham",         currencySymbol:"د.م.",callingCode:"+212",continent:"Africa" },
  { iso2:"PK", iso3:"PAK", name:"Pakistan",         currency:"PKR", currencyName:"Pakistani Rupee",         currencySymbol:"₨",  callingCode:"+92",  continent:"Asia" },
  { iso2:"BD", iso3:"BGD", name:"Bangladesh",       currency:"BDT", currencyName:"Bangladeshi Taka",        currencySymbol:"৳",  callingCode:"+880", continent:"Asia" },
  { iso2:"PH", iso3:"PHL", name:"Philippines",      currency:"PHP", currencyName:"Philippine Peso",         currencySymbol:"₱",  callingCode:"+63",  continent:"Asia" },
  { iso2:"ID", iso3:"IDN", name:"Indonesia",        currency:"IDR", currencyName:"Indonesian Rupiah",       currencySymbol:"Rp", callingCode:"+62",  continent:"Asia" },
  { iso2:"VN", iso3:"VNM", name:"Vietnam",          currency:"VND", currencyName:"Vietnamese Dong",         currencySymbol:"₫",  callingCode:"+84",  continent:"Asia" },
  { iso2:"TH", iso3:"THA", name:"Thailand",         currency:"THB", currencyName:"Thai Baht",               currencySymbol:"฿",  callingCode:"+66",  continent:"Asia" },
  { iso2:"MY", iso3:"MYS", name:"Malaysia",         currency:"MYR", currencyName:"Malaysian Ringgit",       currencySymbol:"RM", callingCode:"+60",  continent:"Asia" },
  { iso2:"TR", iso3:"TUR", name:"Turkey",           currency:"TRY", currencyName:"Turkish Lira",            currencySymbol:"₺",  callingCode:"+90",  continent:"Europe" },
  { iso2:"PL", iso3:"POL", name:"Poland",           currency:"PLN", currencyName:"Polish Zloty",            currencySymbol:"zł", callingCode:"+48",  continent:"Europe" },
  { iso2:"AR", iso3:"ARG", name:"Argentina",        currency:"ARS", currencyName:"Argentine Peso",          currencySymbol:"$",  callingCode:"+54",  continent:"Americas" },
  { iso2:"CO", iso3:"COL", name:"Colombia",         currency:"COP", currencyName:"Colombian Peso",          currencySymbol:"$",  callingCode:"+57",  continent:"Americas" },
  { iso2:"VE", iso3:"VEN", name:"Venezuela",        currency:"VES", currencyName:"Venezuelan Bolívar",      currencySymbol:"Bs.",callingCode:"+58",  continent:"Americas" },
  { iso2:"RW", iso3:"RWA", name:"Rwanda",           currency:"RWF", currencyName:"Rwandan Franc",           currencySymbol:"Fr", callingCode:"+250", continent:"Africa" },
  { iso2:"SN", iso3:"SEN", name:"Senegal",          currency:"XOF", currencyName:"West African Franc",      currencySymbol:"Fr", callingCode:"+221", continent:"Africa" },
  { iso2:"CI", iso3:"CIV", name:"Côte d'Ivoire",   currency:"XOF", currencyName:"West African Franc",      currencySymbol:"Fr", callingCode:"+225", continent:"Africa" },
  { iso2:"CM", iso3:"CMR", name:"Cameroon",         currency:"XAF", currencyName:"Central African Franc",   currencySymbol:"Fr", callingCode:"+237", continent:"Africa" },
  { iso2:"ZM", iso3:"ZMB", name:"Zambia",           currency:"ZMW", currencyName:"Zambian Kwacha",          currencySymbol:"K",  callingCode:"+260", continent:"Africa" },
  { iso2:"ZW", iso3:"ZWE", name:"Zimbabwe",         currency:"ZWL", currencyName:"Zimbabwean Dollar",       currencySymbol:"$",  callingCode:"+263", continent:"Africa" },
  { iso2:"MZ", iso3:"MOZ", name:"Mozambique",       currency:"MZN", currencyName:"Mozambican Metical",      currencySymbol:"MT", callingCode:"+258", continent:"Africa" },
  { iso2:"AO", iso3:"AGO", name:"Angola",           currency:"AOA", currencyName:"Angolan Kwanza",          currencySymbol:"Kz", callingCode:"+244", continent:"Africa" },
  { iso2:"KR", iso3:"KOR", name:"South Korea",      currency:"KRW", currencyName:"South Korean Won",        currencySymbol:"₩",  callingCode:"+82",  continent:"Asia" },
  { iso2:"HK", iso3:"HKG", name:"Hong Kong",        currency:"HKD", currencyName:"Hong Kong Dollar",        currencySymbol:"HK$",callingCode:"+852", continent:"Asia" },
  { iso2:"TW", iso3:"TWN", name:"Taiwan",           currency:"TWD", currencyName:"New Taiwan Dollar",       currencySymbol:"NT$",callingCode:"+886", continent:"Asia" },
  { iso2:"NZ", iso3:"NZL", name:"New Zealand",      currency:"NZD", currencyName:"New Zealand Dollar",      currencySymbol:"NZ$",callingCode:"+64",  continent:"Oceania" },
  { iso2:"NO", iso3:"NOR", name:"Norway",           currency:"NOK", currencyName:"Norwegian Krone",         currencySymbol:"kr", callingCode:"+47",  continent:"Europe" },
  { iso2:"DK", iso3:"DNK", name:"Denmark",          currency:"DKK", currencyName:"Danish Krone",            currencySymbol:"kr", callingCode:"+45",  continent:"Europe" },
  { iso2:"IL", iso3:"ISR", name:"Israel",           currency:"ILS", currencyName:"Israeli Shekel",          currencySymbol:"₪",  callingCode:"+972", continent:"Asia" },
  { iso2:"SA", iso3:"SAU", name:"Saudi Arabia",     currency:"SAR", currencyName:"Saudi Riyal",             currencySymbol:"ر.س",callingCode:"+966", continent:"Asia" },
  { iso2:"QA", iso3:"QAT", name:"Qatar",            currency:"QAR", currencyName:"Qatari Riyal",            currencySymbol:"ر.ق",callingCode:"+974", continent:"Asia" },
  { iso2:"KW", iso3:"KWT", name:"Kuwait",           currency:"KWD", currencyName:"Kuwaiti Dinar",           currencySymbol:"د.ك",callingCode:"+965", continent:"Asia" },
  { iso2:"NG", iso3:"NGA", name:"Nigeria",          currency:"NGN", currencyName:"Nigerian Naira",          currencySymbol:"₦",  callingCode:"+234", continent:"Africa" },
];

// Deduplicate by iso2
const _seenIso: Set<string> = new Set();
export const COUNTRIES_DEDUP = COUNTRIES.filter(c => {
  if (_seenIso.has(c.iso2)) return false;
  _seenIso.add(c.iso2);
  return true;
});

/** Flag image URL for any ISO2 country code */
export function flagUrl(iso2: string): string {
  if (iso2.toUpperCase() === "EU") return "https://flagcdn.com/w40/eu.png";
  return `https://flagcdn.com/w40/${iso2.toLowerCase()}.png`;
}

/** Flag 2× URL (80px wide) for hi-DPI */
export function flagUrl2x(iso2: string): string {
  return `https://flagcdn.com/w80/${iso2.toLowerCase()}.png`;
}

/** Look up country by ISO2 code */
export function getCountry(iso2: string): CountryEntry | undefined {
  return COUNTRIES_DEDUP.find(c => c.iso2.toUpperCase() === iso2.toUpperCase());
}

/** Look up countries by currency code */
export function getCountriesByCurrency(currency: string): CountryEntry[] {
  return COUNTRIES_DEDUP.filter(c => c.currency.toUpperCase() === currency.toUpperCase());
}

// ─────────────────────────────────────────────────────────────────────────────
// PAYMENT PROVIDERS  (Clearbit logo API — https://logo.clearbit.com/{domain})
// ─────────────────────────────────────────────────────────────────────────────

export const PAYMENT_PROVIDERS: PaymentProvider[] = [
  // ── Nigerian banks ───────────────────────────────────────────────────────
  { id:"gtbank",      name:"GTBank",           category:"bank",         countries:["NG"], logoUrl:"https://logo.clearbit.com/gtbank.com",           color:"#e84c3d", website:"gtbank.com",           currencies:["NGN"] },
  { id:"access",      name:"Access Bank",      category:"bank",         countries:["NG","GH","ZA","KE"], logoUrl:"https://logo.clearbit.com/accessbankplc.com",    color:"#e35c2e", website:"accessbankplc.com",    currencies:["NGN","GHS","ZAR","KES"] },
  { id:"zenith",      name:"Zenith Bank",      category:"bank",         countries:["NG","GH"], logoUrl:"https://logo.clearbit.com/zenithbank.com",           color:"#c1272d", website:"zenithbank.com",       currencies:["NGN","GHS"] },
  { id:"uba",         name:"UBA",              category:"bank",         countries:["NG","GH","KE","ZA","CM","SN","CI"], logoUrl:"https://logo.clearbit.com/ubagroup.com",             color:"#e30613", website:"ubagroup.com",         currencies:["NGN","GHS","KES","ZAR"] },
  { id:"firstbank",   name:"First Bank",       category:"bank",         countries:["NG"], logoUrl:"https://logo.clearbit.com/firstbanknigeria.com",     color:"#003087", website:"firstbanknigeria.com", currencies:["NGN"] },
  { id:"fidelity",    name:"Fidelity Bank",    category:"bank",         countries:["NG"], logoUrl:"https://logo.clearbit.com/fidelitybank.ng",          color:"#006c35", website:"fidelitybank.ng",      currencies:["NGN"] },
  { id:"stanbic",     name:"Stanbic IBTC",     category:"bank",         countries:["NG"], logoUrl:"https://logo.clearbit.com/stanbicibtcbank.com",      color:"#0033a0", website:"stanbicibtcbank.com",  currencies:["NGN"] },
  { id:"sterling",    name:"Sterling Bank",    category:"bank",         countries:["NG"], logoUrl:"https://logo.clearbit.com/sterlingbank.com.ng",      color:"#c8232c", website:"sterlingbank.com.ng",  currencies:["NGN"] },
  { id:"fcmb",        name:"FCMB",             category:"bank",         countries:["NG"], logoUrl:"https://logo.clearbit.com/fcmb.com",                 color:"#003580", website:"fcmb.com",             currencies:["NGN"] },
  { id:"union",       name:"Union Bank",       category:"bank",         countries:["NG"], logoUrl:"https://logo.clearbit.com/unionbankng.com",          color:"#004080", website:"unionbankng.com",      currencies:["NGN"] },
  { id:"ecobank",     name:"Ecobank",          category:"bank",         countries:["NG","GH","KE","TZ","UG","CM","SN","CI"], logoUrl:"https://logo.clearbit.com/ecobank.com",              color:"#004a97", website:"ecobank.com",          currencies:["NGN","GHS","KES","TZS","UGX"] },
  // ── Nigerian fintechs ────────────────────────────────────────────────────
  { id:"opay",        name:"OPay",             category:"wallet",       countries:["NG","EG","ET"], logoUrl:"https://logo.clearbit.com/opayweb.com",              color:"#4cd964", website:"opayweb.com",          currencies:["NGN","EGP","ETB"] },
  { id:"moniepoint",  name:"Moniepoint",       category:"wallet",       countries:["NG"], logoUrl:"https://logo.clearbit.com/moniepoint.com",           color:"#fd6b22", website:"moniepoint.com",       currencies:["NGN"] },
  { id:"palmpay",     name:"PalmPay",          category:"wallet",       countries:["NG","GH"], logoUrl:"https://logo.clearbit.com/palmpay.com",               color:"#39b54a", website:"palmpay.com",          currencies:["NGN","GHS"] },
  { id:"kuda",        name:"Kuda Bank",        category:"bank",         countries:["NG"], logoUrl:"https://logo.clearbit.com/kuda.com",                 color:"#4a0080", website:"kuda.com",             currencies:["NGN"] },
  { id:"piggyvest",   name:"PiggyVest",        category:"wallet",       countries:["NG"], logoUrl:"https://logo.clearbit.com/piggyvest.com",            color:"#0e8153", website:"piggyvest.com",        currencies:["NGN"] },
  { id:"flutterwave", name:"Flutterwave",      category:"gateway",      countries:["NG","GH","KE","ZA","US","GB"], logoUrl:"https://logo.clearbit.com/flutterwave.com",         color:"#f5a623", website:"flutterwave.com",      currencies:["NGN","GHS","KES","ZAR","USD","GBP"] },
  { id:"paystack",    name:"Paystack",         category:"gateway",      countries:["NG","GH","ZA","KE"], logoUrl:"https://logo.clearbit.com/paystack.com",             color:"#00c3f7", website:"paystack.com",         currencies:["NGN","GHS","ZAR","KES"] },
  // ── Global providers ─────────────────────────────────────────────────────
  { id:"paypal",      name:"PayPal",           category:"wallet",       countries:["US","GB","EU","CA","AU","SG"], logoUrl:"https://logo.clearbit.com/paypal.com",               color:"#003087", website:"paypal.com",           currencies:["USD","GBP","EUR","CAD","AUD","SGD"] },
  { id:"wise",        name:"Wise",             category:"gateway",      countries:["US","GB","EU","CA","AU","SG","IN"], logoUrl:"https://logo.clearbit.com/wise.com",                 color:"#37517e", website:"wise.com",             currencies:["USD","GBP","EUR","CAD","AUD","INR"] },
  { id:"revolut",     name:"Revolut",          category:"wallet",       countries:["GB","EU","US","AU","SG"], logoUrl:"https://logo.clearbit.com/revolut.com",             color:"#191c1f", website:"revolut.com",          currencies:["GBP","EUR","USD"] },
  { id:"cashapp",     name:"Cash App",         category:"wallet",       countries:["US","GB"], logoUrl:"https://logo.clearbit.com/cash.app",                 color:"#00d64f", website:"cash.app",             currencies:["USD","GBP"] },
  { id:"venmo",       name:"Venmo",            category:"wallet",       countries:["US"], logoUrl:"https://logo.clearbit.com/venmo.com",                color:"#008cff", website:"venmo.com",            currencies:["USD"] },
  { id:"zelle",       name:"Zelle",            category:"gateway",      countries:["US"], logoUrl:"https://logo.clearbit.com/zellepay.com",             color:"#6d1ed4", website:"zellepay.com",         currencies:["USD"] },
  { id:"stripe",      name:"Stripe",           category:"gateway",      countries:["US","GB","EU","CA","AU"], logoUrl:"https://logo.clearbit.com/stripe.com",               color:"#6772e5", website:"stripe.com",           currencies:["USD","GBP","EUR","CAD","AUD"] },
  // ── East Africa mobile money ─────────────────────────────────────────────
  { id:"mpesa",       name:"M-Pesa",           category:"mobile_money", countries:["KE","TZ","UG","GH"], logoUrl:"https://logo.clearbit.com/safaricom.co.ke",          color:"#4cc400", website:"safaricom.co.ke",      currencies:["KES","TZS","UGX","GHS"] },
  { id:"airtel_money",name:"Airtel Money",     category:"mobile_money", countries:["KE","UG","TZ","ZM","NG","GH"], logoUrl:"https://logo.clearbit.com/africa.airtel.com",        color:"#e40000", website:"africa.airtel.com",    currencies:["KES","UGX","TZS","ZMW","NGN","GHS"] },
  { id:"mtn_momo",    name:"MTN MoMo",         category:"mobile_money", countries:["NG","GH","ZA","UG","CM","CI","SN","RW"], logoUrl:"https://logo.clearbit.com/mtn.com",                  color:"#ffcc00", website:"mtn.com",              currencies:["NGN","GHS","ZAR","UGX"] },
  // ── Asian providers ───────────────────────────────────────────────────────
  { id:"gcash",       name:"GCash",            category:"mobile_money", countries:["PH"], logoUrl:"https://logo.clearbit.com/gcash.com",                color:"#007dff", website:"gcash.com",            currencies:["PHP"] },
  { id:"paytm",       name:"Paytm",            category:"wallet",       countries:["IN"], logoUrl:"https://logo.clearbit.com/paytm.com",                color:"#002970", website:"paytm.com",            currencies:["INR"] },
  { id:"upi",         name:"UPI",              category:"gateway",      countries:["IN"], logoUrl:"https://logo.clearbit.com/upi.gov.in",              color:"#097939", website:"upi.gov.in",           currencies:["INR"] },
  { id:"alipay",      name:"Alipay",           category:"wallet",       countries:["CN","MY","SG","AU"], logoUrl:"https://logo.clearbit.com/alipay.com",               color:"#1677ff", website:"alipay.com",           currencies:["CNY","MYR","SGD","AUD"] },
  { id:"wechat_pay",  name:"WeChat Pay",       category:"wallet",       countries:["CN","MY","SG"], logoUrl:"https://logo.clearbit.com/tencent.com",              color:"#07c160", website:"tencent.com",          currencies:["CNY"] },
  // ── SEPA / SWIFT ─────────────────────────────────────────────────────────
  { id:"sepa",        name:"SEPA Bank Transfer",category:"gateway",     countries:["EU","GB","CH","NO","SE","DK","PL","TR","IL"], logoUrl:"https://logo.clearbit.com/europeanpaymentscouncil.eu", color:"#003087", website:"europeanpaymentscouncil.eu", currencies:["EUR","GBP","CHF","SEK","NOK","DKK","PLN"] },
  { id:"swift",       name:"SWIFT / Wire",     category:"gateway",      countries:["US","GB","EU","SG","AU","CA","JP","AE","SA","QA","KW"], logoUrl:"https://logo.clearbit.com/swift.com",                color:"#0066cc", website:"swift.com",            currencies:["USD","GBP","EUR","SGD","AUD","CAD","JPY","AED","SAR"] },
  // ── Crypto fiat rails ─────────────────────────────────────────────────────
  { id:"moonpay",     name:"MoonPay",          category:"gateway",      countries:["US","GB","EU","CA","AU","SG","NG","KE","ZA","GH"], logoUrl:"https://logo.clearbit.com/moonpay.com",              color:"#7b2cf5", website:"moonpay.com",          currencies:["USD","GBP","EUR","NGN","KES","ZAR","GHS"] },
  { id:"transak",     name:"Transak",          category:"gateway",      countries:["US","GB","EU","IN","NG","KE","ZA","GH"], logoUrl:"https://logo.clearbit.com/transak.com",              color:"#0046e8", website:"transak.com",          currencies:["USD","GBP","EUR","INR","NGN","KES","ZAR","GHS"] },
];

/** Look up payment providers for a country */
export function getProvidersByCountry(iso2: string): PaymentProvider[] {
  return PAYMENT_PROVIDERS.filter(p => p.countries.includes(iso2.toUpperCase()));
}

/** Clearbit logo URL for any domain */
export function clearbitLogo(domain: string, size = 64): string {
  return `https://logo.clearbit.com/${domain}?size=${size}`;
}
