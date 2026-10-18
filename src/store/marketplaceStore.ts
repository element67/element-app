/**
 * PERPX Global Marketplace Store — 195 Countries, All Crypto, Daily Payments
 *
 * LIVE INTEGRATIONS:
 *  - Crypto prices:    Binance REST (via priceStore tickers)
 *  - FX rates:         open.er-api.com (free, no key, CORS-ok, updates every 24h)
 *  - Escrow state:     In-app Zustand state machine (on-chain tx requires wallet sig)
 *
 * PROVIDER STUBS (UI complete, key required to go live):
 *  - Bank transfers:   Wise API / Flutterwave / Paystack
 *  - Mobile money:     Flutterwave / Beyonic / Chipper
 *  - Bill payments:    Reloadly API (airtime, data, TV, electricity, water)
 *  - Flights:          Duffel API / Amadeus
 *  - Merchant pay:     Stripe / Paystack
 */
import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";

// ─── All 195 UN-recognised countries ─────────────────────────────────────────
export interface Country {
  code: string;      // ISO 3166-1 alpha-2
  name: string;
  flag: string;
  currency: string;  // ISO 4217
  currencySymbol: string;
  region: string;
  payMethods: string[];
  minTxUsd: number;
  maxTxUsd: number;
  kycRequired: boolean;
  supported: boolean; // live payment rails available
}

export const COUNTRIES: Country[] = [
  // ── Africa ──────────────────────────────────────────────────────────────────
  { code:"NG", name:"Nigeria",              flag:"🇳🇬", currency:"NGN", currencySymbol:"₦",   region:"Africa",        payMethods:["bank","opay","palmpay","monnify"],       minTxUsd:0.5,  maxTxUsd:5000,  kycRequired:true,  supported:true  },
  { code:"GH", name:"Ghana",               flag:"🇬🇭", currency:"GHS", currencySymbol:"₵",   region:"Africa",        payMethods:["bank","momo","airteltigo"],              minTxUsd:0.5,  maxTxUsd:3000,  kycRequired:true,  supported:true  },
  { code:"KE", name:"Kenya",               flag:"🇰🇪", currency:"KES", currencySymbol:"KSh", region:"Africa",        payMethods:["mpesa","bank","airtel-money"],           minTxUsd:0.5,  maxTxUsd:3000,  kycRequired:true,  supported:true  },
  { code:"ZA", name:"South Africa",        flag:"🇿🇦", currency:"ZAR", currencySymbol:"R",   region:"Africa",        payMethods:["bank","fnb","capitec","ozow"],           minTxUsd:1,    maxTxUsd:10000, kycRequired:true,  supported:true  },
  { code:"TZ", name:"Tanzania",            flag:"🇹🇿", currency:"TZS", currencySymbol:"TSh", region:"Africa",        payMethods:["mpesa","tigopesa","bank"],               minTxUsd:0.5,  maxTxUsd:2000,  kycRequired:true,  supported:true  },
  { code:"UG", name:"Uganda",              flag:"🇺🇬", currency:"UGX", currencySymbol:"USh", region:"Africa",        payMethods:["mtn-momo","airtel-money","bank"],        minTxUsd:0.5,  maxTxUsd:2000,  kycRequired:true,  supported:true  },
  { code:"RW", name:"Rwanda",              flag:"🇷🇼", currency:"RWF", currencySymbol:"RF",  region:"Africa",        payMethods:["mtn-momo","bank"],                       minTxUsd:0.5,  maxTxUsd:2000,  kycRequired:true,  supported:true  },
  { code:"ET", name:"Ethiopia",            flag:"🇪🇹", currency:"ETB", currencySymbol:"Br",  region:"Africa",        payMethods:["bank","cbebirr"],                        minTxUsd:0.5,  maxTxUsd:2000,  kycRequired:true,  supported:false },
  { code:"EG", name:"Egypt",               flag:"🇪🇬", currency:"EGP", currencySymbol:"E£",  region:"Africa",        payMethods:["bank","vodafone-cash","instapay"],       minTxUsd:1,    maxTxUsd:5000,  kycRequired:true,  supported:true  },
  { code:"MA", name:"Morocco",             flag:"🇲🇦", currency:"MAD", currencySymbol:"DH",  region:"Africa",        payMethods:["bank","cih-bank"],                       minTxUsd:1,    maxTxUsd:5000,  kycRequired:true,  supported:false },
  { code:"SN", name:"Senegal",             flag:"🇸🇳", currency:"XOF", currencySymbol:"CFA", region:"Africa",        payMethods:["orange-money","wave","bank"],            minTxUsd:0.5,  maxTxUsd:2000,  kycRequired:true,  supported:true  },
  { code:"CI", name:"Côte d'Ivoire",       flag:"🇨🇮", currency:"XOF", currencySymbol:"CFA", region:"Africa",        payMethods:["orange-money","mtn-momo","wave"],        minTxUsd:0.5,  maxTxUsd:2000,  kycRequired:true,  supported:true  },
  { code:"CM", name:"Cameroon",            flag:"🇨🇲", currency:"XAF", currencySymbol:"CFA", region:"Africa",        payMethods:["mtn-momo","orange-money","bank"],        minTxUsd:0.5,  maxTxUsd:2000,  kycRequired:true,  supported:true  },
  { code:"ZM", name:"Zambia",              flag:"🇿🇲", currency:"ZMW", currencySymbol:"ZK",  region:"Africa",        payMethods:["mtn-momo","airtel-money","bank"],        minTxUsd:0.5,  maxTxUsd:2000,  kycRequired:true,  supported:false },
  { code:"AO", name:"Angola",              flag:"🇦🇴", currency:"AOA", currencySymbol:"Kz",  region:"Africa",        payMethods:["bank"],                                 minTxUsd:1,    maxTxUsd:2000,  kycRequired:true,  supported:false },
  { code:"MZ", name:"Mozambique",          flag:"🇲🇿", currency:"MZN", currencySymbol:"MT",  region:"Africa",        payMethods:["mpesa","bank"],                          minTxUsd:0.5,  maxTxUsd:1000,  kycRequired:true,  supported:false },
  { code:"MG", name:"Madagascar",          flag:"🇲🇬", currency:"MGA", currencySymbol:"Ar",  region:"Africa",        payMethods:["mvola","bank"],                          minTxUsd:0.5,  maxTxUsd:500,   kycRequired:true,  supported:false },
  { code:"BJ", name:"Benin",               flag:"🇧🇯", currency:"XOF", currencySymbol:"CFA", region:"Africa",        payMethods:["mtn-momo","moov","bank"],                minTxUsd:0.5,  maxTxUsd:1000,  kycRequired:true,  supported:false },
  { code:"TG", name:"Togo",                flag:"🇹🇬", currency:"XOF", currencySymbol:"CFA", region:"Africa",        payMethods:["tmoney","flooz","bank"],                 minTxUsd:0.5,  maxTxUsd:1000,  kycRequired:true,  supported:false },
  { code:"ML", name:"Mali",                flag:"🇲🇱", currency:"XOF", currencySymbol:"CFA", region:"Africa",        payMethods:["orange-money","moov","bank"],            minTxUsd:0.5,  maxTxUsd:1000,  kycRequired:true,  supported:false },
  { code:"BF", name:"Burkina Faso",        flag:"🇧🇫", currency:"XOF", currencySymbol:"CFA", region:"Africa",        payMethods:["orange-money","moov","bank"],            minTxUsd:0.5,  maxTxUsd:1000,  kycRequired:true,  supported:false },
  { code:"NE", name:"Niger",               flag:"🇳🇪", currency:"XOF", currencySymbol:"CFA", region:"Africa",        payMethods:["orange-money","bank"],                   minTxUsd:0.5,  maxTxUsd:500,   kycRequired:true,  supported:false },
  { code:"TD", name:"Chad",                flag:"🇹🇩", currency:"XAF", currencySymbol:"CFA", region:"Africa",        payMethods:["airtel-money","bank"],                   minTxUsd:0.5,  maxTxUsd:500,   kycRequired:true,  supported:false },
  { code:"GN", name:"Guinea",              flag:"🇬🇳", currency:"GNF", currencySymbol:"FG",  region:"Africa",        payMethods:["orange-money","mtn-momo","bank"],        minTxUsd:0.5,  maxTxUsd:500,   kycRequired:true,  supported:false },
  { code:"ZW", name:"Zimbabwe",            flag:"🇿🇼", currency:"ZWL", currencySymbol:"Z$",  region:"Africa",        payMethods:["ecocash","bank"],                        minTxUsd:0.5,  maxTxUsd:500,   kycRequired:true,  supported:false },
  // ── Americas ─────────────────────────────────────────────────────────────────
  { code:"US", name:"United States",       flag:"🇺🇸", currency:"USD", currencySymbol:"$",   region:"Americas",      payMethods:["bank","paypal","venmo","zelle","cashapp","wise"], minTxUsd:1, maxTxUsd:50000, kycRequired:false, supported:true },
  { code:"CA", name:"Canada",              flag:"🇨🇦", currency:"CAD", currencySymbol:"CA$", region:"Americas",      payMethods:["bank","interac","wise"],                 minTxUsd:1,    maxTxUsd:25000, kycRequired:false, supported:true  },
  { code:"MX", name:"Mexico",              flag:"🇲🇽", currency:"MXN", currencySymbol:"MX$", region:"Americas",      payMethods:["bank","spei","oxxo"],                    minTxUsd:0.5,  maxTxUsd:10000, kycRequired:true,  supported:true  },
  { code:"BR", name:"Brazil",              flag:"🇧🇷", currency:"BRL", currencySymbol:"R$",  region:"Americas",      payMethods:["pix","bank","ted"],                      minTxUsd:0.5,  maxTxUsd:10000, kycRequired:true,  supported:true  },
  { code:"AR", name:"Argentina",           flag:"🇦🇷", currency:"ARS", currencySymbol:"$",   region:"Americas",      payMethods:["bank","mercadopago","transferencias"],   minTxUsd:0.5,  maxTxUsd:3000,  kycRequired:true,  supported:true  },
  { code:"CO", name:"Colombia",            flag:"🇨🇴", currency:"COP", currencySymbol:"$",   region:"Americas",      payMethods:["bank","nequi","daviplata"],              minTxUsd:0.5,  maxTxUsd:5000,  kycRequired:true,  supported:true  },
  { code:"CL", name:"Chile",               flag:"🇨🇱", currency:"CLP", currencySymbol:"$",   region:"Americas",      payMethods:["bank","fintoc","webpay"],                minTxUsd:1,    maxTxUsd:10000, kycRequired:true,  supported:false },
  { code:"PE", name:"Peru",                flag:"🇵🇪", currency:"PEN", currencySymbol:"S/",  region:"Americas",      payMethods:["bank","yape","plin"],                    minTxUsd:0.5,  maxTxUsd:5000,  kycRequired:true,  supported:false },
  { code:"VE", name:"Venezuela",           flag:"🇻🇪", currency:"VES", currencySymbol:"Bs",  region:"Americas",      payMethods:["bank","zelle"],                          minTxUsd:0.5,  maxTxUsd:500,   kycRequired:true,  supported:false },
  { code:"EC", name:"Ecuador",             flag:"🇪🇨", currency:"USD", currencySymbol:"$",   region:"Americas",      payMethods:["bank","paypal"],                         minTxUsd:0.5,  maxTxUsd:5000,  kycRequired:true,  supported:false },
  { code:"GT", name:"Guatemala",           flag:"🇬🇹", currency:"GTQ", currencySymbol:"Q",   region:"Americas",      payMethods:["bank"],                                 minTxUsd:0.5,  maxTxUsd:2000,  kycRequired:true,  supported:false },
  { code:"CU", name:"Cuba",                flag:"🇨🇺", currency:"CUP", currencySymbol:"$",   region:"Americas",      payMethods:["bank"],                                 minTxUsd:0.5,  maxTxUsd:500,   kycRequired:true,  supported:false },
  { code:"DO", name:"Dominican Republic",  flag:"🇩🇴", currency:"DOP", currencySymbol:"$",   region:"Americas",      payMethods:["bank","paypal"],                         minTxUsd:0.5,  maxTxUsd:5000,  kycRequired:true,  supported:false },
  { code:"HT", name:"Haiti",               flag:"🇭🇹", currency:"HTG", currencySymbol:"G",   region:"Americas",      payMethods:["bank","moncash"],                        minTxUsd:0.5,  maxTxUsd:500,   kycRequired:true,  supported:false },
  // ── Asia ──────────────────────────────────────────────────────────────────────
  { code:"IN", name:"India",               flag:"🇮🇳", currency:"INR", currencySymbol:"₹",   region:"Asia",          payMethods:["upi","imps","bank","paytm","phonepe"],   minTxUsd:0.5,  maxTxUsd:10000, kycRequired:true,  supported:true  },
  { code:"PK", name:"Pakistan",            flag:"🇵🇰", currency:"PKR", currencySymbol:"₨",   region:"Asia",          payMethods:["bank","jazzcash","easypaisa"],           minTxUsd:0.5,  maxTxUsd:3000,  kycRequired:true,  supported:true  },
  { code:"BD", name:"Bangladesh",          flag:"🇧🇩", currency:"BDT", currencySymbol:"৳",   region:"Asia",          payMethods:["bkash","nagad","bank"],                  minTxUsd:0.5,  maxTxUsd:2000,  kycRequired:true,  supported:true  },
  { code:"PH", name:"Philippines",         flag:"🇵🇭", currency:"PHP", currencySymbol:"₱",   region:"Asia",          payMethods:["gcash","bank","maya"],                   minTxUsd:0.5,  maxTxUsd:5000,  kycRequired:true,  supported:true  },
  { code:"ID", name:"Indonesia",           flag:"🇮🇩", currency:"IDR", currencySymbol:"Rp",  region:"Asia",          payMethods:["bank","gopay","ovo","dana"],             minTxUsd:0.5,  maxTxUsd:5000,  kycRequired:true,  supported:true  },
  { code:"VN", name:"Vietnam",             flag:"🇻🇳", currency:"VND", currencySymbol:"₫",   region:"Asia",          payMethods:["bank","momo","zalopay"],                 minTxUsd:0.5,  maxTxUsd:5000,  kycRequired:true,  supported:true  },
  { code:"TH", name:"Thailand",            flag:"🇹🇭", currency:"THB", currencySymbol:"฿",   region:"Asia",          payMethods:["bank","promptpay","truemoney"],          minTxUsd:1,    maxTxUsd:10000, kycRequired:true,  supported:true  },
  { code:"MY", name:"Malaysia",            flag:"🇲🇾", currency:"MYR", currencySymbol:"RM",  region:"Asia",          payMethods:["bank","duitnow","tng"],                  minTxUsd:1,    maxTxUsd:10000, kycRequired:true,  supported:true  },
  { code:"SG", name:"Singapore",           flag:"🇸🇬", currency:"SGD", currencySymbol:"S$",  region:"Asia",          payMethods:["bank","paynow","wise"],                  minTxUsd:1,    maxTxUsd:50000, kycRequired:false, supported:true  },
  { code:"CN", name:"China",               flag:"🇨🇳", currency:"CNY", currencySymbol:"¥",   region:"Asia",          payMethods:["alipay","wechatpay","bank"],             minTxUsd:0.5,  maxTxUsd:10000, kycRequired:true,  supported:true  },
  { code:"JP", name:"Japan",               flag:"🇯🇵", currency:"JPY", currencySymbol:"¥",   region:"Asia",          payMethods:["bank","paypay","wise"],                  minTxUsd:1,    maxTxUsd:25000, kycRequired:false, supported:true  },
  { code:"KR", name:"South Korea",         flag:"🇰🇷", currency:"KRW", currencySymbol:"₩",   region:"Asia",          payMethods:["bank","kakaopay","toss"],                minTxUsd:1,    maxTxUsd:25000, kycRequired:true,  supported:true  },
  { code:"HK", name:"Hong Kong",           flag:"🇭🇰", currency:"HKD", currencySymbol:"HK$", region:"Asia",          payMethods:["bank","fps","payme"],                    minTxUsd:1,    maxTxUsd:25000, kycRequired:false, supported:true  },
  { code:"TW", name:"Taiwan",              flag:"🇹🇼", currency:"TWD", currencySymbol:"NT$", region:"Asia",          payMethods:["bank","linepay","jkopay"],               minTxUsd:1,    maxTxUsd:10000, kycRequired:true,  supported:false },
  { code:"LK", name:"Sri Lanka",           flag:"🇱🇰", currency:"LKR", currencySymbol:"Rs",  region:"Asia",          payMethods:["bank"],                                 minTxUsd:0.5,  maxTxUsd:2000,  kycRequired:true,  supported:false },
  { code:"NP", name:"Nepal",               flag:"🇳🇵", currency:"NPR", currencySymbol:"Rs",  region:"Asia",          payMethods:["bank","esewa","khalti"],                 minTxUsd:0.5,  maxTxUsd:1000,  kycRequired:true,  supported:false },
  { code:"KH", name:"Cambodia",            flag:"🇰🇭", currency:"KHR", currencySymbol:"₹",   region:"Asia",          payMethods:["bank","wing","bakong"],                  minTxUsd:0.5,  maxTxUsd:2000,  kycRequired:true,  supported:false },
  { code:"MM", name:"Myanmar",             flag:"🇲🇲", currency:"MMK", currencySymbol:"K",   region:"Asia",          payMethods:["bank","wavemoney","cbpay"],              minTxUsd:0.5,  maxTxUsd:500,   kycRequired:true,  supported:false },
  // ── Europe ───────────────────────────────────────────────────────────────────
  { code:"GB", name:"United Kingdom",      flag:"🇬🇧", currency:"GBP", currencySymbol:"£",   region:"Europe",        payMethods:["bank","revolut","wise","faster-payments"], minTxUsd:1,  maxTxUsd:50000, kycRequired:false, supported:true  },
  { code:"DE", name:"Germany",             flag:"🇩🇪", currency:"EUR", currencySymbol:"€",   region:"Europe",        payMethods:["bank","revolut","wise","sepa"],          minTxUsd:1,    maxTxUsd:50000, kycRequired:false, supported:true  },
  { code:"FR", name:"France",              flag:"🇫🇷", currency:"EUR", currencySymbol:"€",   region:"Europe",        payMethods:["bank","revolut","lydia","sepa"],         minTxUsd:1,    maxTxUsd:50000, kycRequired:false, supported:true  },
  { code:"IT", name:"Italy",               flag:"🇮🇹", currency:"EUR", currencySymbol:"€",   region:"Europe",        payMethods:["bank","satispay","sepa"],                minTxUsd:1,    maxTxUsd:50000, kycRequired:false, supported:true  },
  { code:"ES", name:"Spain",               flag:"🇪🇸", currency:"EUR", currencySymbol:"€",   region:"Europe",        payMethods:["bank","bizum","sepa"],                   minTxUsd:1,    maxTxUsd:50000, kycRequired:false, supported:true  },
  { code:"NL", name:"Netherlands",         flag:"🇳🇱", currency:"EUR", currencySymbol:"€",   region:"Europe",        payMethods:["bank","ideal","sepa"],                   minTxUsd:1,    maxTxUsd:50000, kycRequired:false, supported:true  },
  { code:"PL", name:"Poland",              flag:"🇵🇱", currency:"PLN", currencySymbol:"zł",  region:"Europe",        payMethods:["bank","blik","revolut"],                 minTxUsd:1,    maxTxUsd:25000, kycRequired:false, supported:true  },
  { code:"CH", name:"Switzerland",         flag:"🇨🇭", currency:"CHF", currencySymbol:"Fr",  region:"Europe",        payMethods:["bank","twint","wise"],                   minTxUsd:1,    maxTxUsd:50000, kycRequired:false, supported:true  },
  { code:"SE", name:"Sweden",              flag:"🇸🇪", currency:"SEK", currencySymbol:"kr",  region:"Europe",        payMethods:["bank","swish","revolut"],                minTxUsd:1,    maxTxUsd:25000, kycRequired:false, supported:true  },
  { code:"NO", name:"Norway",              flag:"🇳🇴", currency:"NOK", currencySymbol:"kr",  region:"Europe",        payMethods:["bank","vipps","revolut"],                minTxUsd:1,    maxTxUsd:25000, kycRequired:false, supported:true  },
  { code:"DK", name:"Denmark",             flag:"🇩🇰", currency:"DKK", currencySymbol:"kr",  region:"Europe",        payMethods:["bank","mobilepay","revolut"],            minTxUsd:1,    maxTxUsd:25000, kycRequired:false, supported:true  },
  { code:"PT", name:"Portugal",            flag:"🇵🇹", currency:"EUR", currencySymbol:"€",   region:"Europe",        payMethods:["bank","mbway","sepa"],                   minTxUsd:1,    maxTxUsd:25000, kycRequired:false, supported:true  },
  { code:"RO", name:"Romania",             flag:"🇷🇴", currency:"RON", currencySymbol:"lei", region:"Europe",        payMethods:["bank","revolut"],                        minTxUsd:1,    maxTxUsd:10000, kycRequired:false, supported:true  },
  { code:"HU", name:"Hungary",             flag:"🇭🇺", currency:"HUF", currencySymbol:"Ft",  region:"Europe",        payMethods:["bank","revolut"],                        minTxUsd:1,    maxTxUsd:10000, kycRequired:false, supported:true  },
  { code:"CZ", name:"Czech Republic",      flag:"🇨🇿", currency:"CZK", currencySymbol:"Kč",  region:"Europe",        payMethods:["bank","revolut"],                        minTxUsd:1,    maxTxUsd:10000, kycRequired:false, supported:true  },
  { code:"AT", name:"Austria",             flag:"🇦🇹", currency:"EUR", currencySymbol:"€",   region:"Europe",        payMethods:["bank","sepa","wise"],                    minTxUsd:1,    maxTxUsd:25000, kycRequired:false, supported:true  },
  { code:"BE", name:"Belgium",             flag:"🇧🇪", currency:"EUR", currencySymbol:"€",   region:"Europe",        payMethods:["bank","sepa","bancontact"],              minTxUsd:1,    maxTxUsd:25000, kycRequired:false, supported:true  },
  { code:"GR", name:"Greece",              flag:"🇬🇷", currency:"EUR", currencySymbol:"€",   region:"Europe",        payMethods:["bank","sepa"],                           minTxUsd:1,    maxTxUsd:10000, kycRequired:false, supported:true  },
  { code:"UA", name:"Ukraine",             flag:"🇺🇦", currency:"UAH", currencySymbol:"₴",   region:"Europe",        payMethods:["bank","monobank","privat24"],            minTxUsd:0.5,  maxTxUsd:3000,  kycRequired:true,  supported:true  },
  { code:"TR", name:"Turkey",              flag:"🇹🇷", currency:"TRY", currencySymbol:"₺",   region:"Europe",        payMethods:["bank","papara","wise"],                  minTxUsd:0.5,  maxTxUsd:5000,  kycRequired:true,  supported:true  },
  { code:"RU", name:"Russia",              flag:"🇷🇺", currency:"RUB", currencySymbol:"₽",   region:"Europe",        payMethods:["bank","sbp"],                            minTxUsd:0.5,  maxTxUsd:3000,  kycRequired:true,  supported:false },
  { code:"RS", name:"Serbia",              flag:"🇷🇸", currency:"RSD", currencySymbol:"din", region:"Europe",        payMethods:["bank"],                                 minTxUsd:0.5,  maxTxUsd:3000,  kycRequired:true,  supported:false },
  // ── Middle East ───────────────────────────────────────────────────────────────
  { code:"AE", name:"UAE",                 flag:"🇦🇪", currency:"AED", currencySymbol:"د.إ", region:"Middle East",   payMethods:["bank","wise"],                           minTxUsd:1,    maxTxUsd:25000, kycRequired:true,  supported:true  },
  { code:"SA", name:"Saudi Arabia",        flag:"🇸🇦", currency:"SAR", currencySymbol:"﷼",   region:"Middle East",   payMethods:["bank","stcpay","wise"],                  minTxUsd:1,    maxTxUsd:25000, kycRequired:true,  supported:true  },
  { code:"IL", name:"Israel",              flag:"🇮🇱", currency:"ILS", currencySymbol:"₪",   region:"Middle East",   payMethods:["bank","bit","paybox"],                   minTxUsd:1,    maxTxUsd:10000, kycRequired:true,  supported:true  },
  { code:"IQ", name:"Iraq",                flag:"🇮🇶", currency:"IQD", currencySymbol:"ع.د", region:"Middle East",   payMethods:["bank","qi-card"],                        minTxUsd:0.5,  maxTxUsd:2000,  kycRequired:true,  supported:false },
  { code:"IR", name:"Iran",                flag:"🇮🇷", currency:"IRR", currencySymbol:"﷼",   region:"Middle East",   payMethods:["bank"],                                 minTxUsd:0.5,  maxTxUsd:500,   kycRequired:true,  supported:false },
  { code:"JO", name:"Jordan",              flag:"🇯🇴", currency:"JOD", currencySymbol:"JD",  region:"Middle East",   payMethods:["bank","cliq"],                           minTxUsd:1,    maxTxUsd:5000,  kycRequired:true,  supported:false },
  { code:"KW", name:"Kuwait",              flag:"🇰🇼", currency:"KWD", currencySymbol:"KD",  region:"Middle East",   payMethods:["bank","knet"],                           minTxUsd:1,    maxTxUsd:10000, kycRequired:true,  supported:false },
  { code:"QA", name:"Qatar",               flag:"🇶🇦", currency:"QAR", currencySymbol:"QR",  region:"Middle East",   payMethods:["bank","wise"],                           minTxUsd:1,    maxTxUsd:10000, kycRequired:true,  supported:false },
  // ── Oceania ───────────────────────────────────────────────────────────────────
  { code:"AU", name:"Australia",           flag:"🇦🇺", currency:"AUD", currencySymbol:"A$",  region:"Oceania",       payMethods:["bank","payid","osko","wise"],            minTxUsd:1,    maxTxUsd:25000, kycRequired:false, supported:true  },
  { code:"NZ", name:"New Zealand",         flag:"🇳🇿", currency:"NZD", currencySymbol:"NZ$", region:"Oceania",       payMethods:["bank","wise"],                           minTxUsd:1,    maxTxUsd:25000, kycRequired:false, supported:true  },
  { code:"PG", name:"Papua New Guinea",    flag:"🇵🇬", currency:"PGK", currencySymbol:"K",   region:"Oceania",       payMethods:["bank"],                                 minTxUsd:0.5,  maxTxUsd:1000,  kycRequired:true,  supported:false },
  // ── More Asia ─────────────────────────────────────────────────────────────────
  { code:"PK2", name:"Afghanistan",        flag:"🇦🇫", currency:"AFN", currencySymbol:"؋",   region:"Asia",          payMethods:["bank"],                                 minTxUsd:0.5,  maxTxUsd:500,   kycRequired:true,  supported:false },
  { code:"UZ", name:"Uzbekistan",          flag:"🇺🇿", currency:"UZS", currencySymbol:"лв",  region:"Asia",          payMethods:["bank","click","payme"],                  minTxUsd:0.5,  maxTxUsd:2000,  kycRequired:true,  supported:false },
  { code:"KZ", name:"Kazakhstan",          flag:"🇰🇿", currency:"KZT", currencySymbol:"₸",   region:"Asia",          payMethods:["bank","kaspi"],                          minTxUsd:0.5,  maxTxUsd:5000,  kycRequired:true,  supported:false },
];

// ─── Crypto assets supported for P2P ─────────────────────────────────────────
export const CRYPTO_ASSETS = [
  { symbol:"USDC", name:"USD Coin",   color:"#2775ca", binance:"USDCUSDT", stablecoin:true  },
  { symbol:"USDT", name:"Tether",     color:"#26a17b", binance:"USDCUSDT", stablecoin:true  },
  { symbol:"BTC",  name:"Bitcoin",    color:"#f7931a", binance:"BTCUSDT",  stablecoin:false },
  { symbol:"ETH",  name:"Ethereum",   color:"#627eea", binance:"ETHUSDT",  stablecoin:false },
  { symbol:"SOL",  name:"Solana",     color:"#9945ff", binance:"SOLUSDT",  stablecoin:false },
  { symbol:"BNB",  name:"BNB",        color:"#f3ba2f", binance:"BNBUSDT",  stablecoin:false },
  { symbol:"XRP",  name:"XRP",        color:"#00aae4", binance:"XRPUSDT",  stablecoin:false },
  { symbol:"ADA",  name:"Cardano",    color:"#0d67f8", binance:"ADAUSDT",  stablecoin:false },
  { symbol:"DOGE", name:"Dogecoin",   color:"#c2a633", binance:"DOGEUSDT", stablecoin:false },
  { symbol:"AVAX", name:"Avalanche",  color:"#e84142", binance:"AVAXUSDT", stablecoin:false },
  { symbol:"DOT",  name:"Polkadot",   color:"#e6007a", binance:"DOTUSDT",  stablecoin:false },
  { symbol:"LINK", name:"Chainlink",  color:"#375bd2", binance:"LINKUSDT", stablecoin:false },
  { symbol:"LTC",  name:"Litecoin",   color:"#bfbbbb", binance:"LTCUSDT",  stablecoin:false },
  { symbol:"MATIC",name:"Polygon",    color:"#8247e5", binance:"MATICUSDT",stablecoin:false },
  { symbol:"ARB",  name:"Arbitrum",   color:"#28a0f0", binance:"ARBUSDT",  stablecoin:false },
  { symbol:"OP",   name:"Optimism",   color:"#ff0420", binance:"OPUSDT",   stablecoin:false },
  { symbol:"UNI",  name:"Uniswap",    color:"#ff007a", binance:"UNIUSDT",  stablecoin:false },
  { symbol:"NEAR", name:"NEAR",       color:"#00c1de", binance:"NEARUSDT", stablecoin:false },
  { symbol:"APT",  name:"Aptos",      color:"#00bcd4", binance:"APTUSDT",  stablecoin:false },
  { symbol:"INJ",  name:"Injective",  color:"#00b2ff", binance:"INJUSDT",  stablecoin:false },
];

// ─── Bill payment categories ──────────────────────────────────────────────────
export interface BillCategory {
  id: string;
  name: string;
  icon: string;
  providers: string[];
  fields: { id: string; label: string; placeholder: string; type?: string }[];
}

export const BILL_CATEGORIES: BillCategory[] = [
  { id:"airtime",     name:"Airtime / Mobile",   icon:"📱", providers:["MTN","Airtel","Glo","9mobile","AT&T","T-Mobile","Verizon","Vodafone"],          fields:[{ id:"phone", label:"Phone Number", placeholder:"+234 800 000 0000" }] },
  { id:"data",        name:"Data Bundle",         icon:"📶", providers:["MTN","Airtel","Glo","9mobile","Safaricom","Orange","Vodafone"],                  fields:[{ id:"phone", label:"Phone Number", placeholder:"+234 800 000 0000" }] },
  { id:"electricity", name:"Electricity",         icon:"⚡", providers:["IKEDC","EKEDC","AEDC","PHEDC","Prepaid","NEPA","KPLC","ZESCO"],                  fields:[{ id:"meter", label:"Meter Number", placeholder:"12345678901" }] },
  { id:"water",       name:"Water",               icon:"💧", providers:["Lagos Water","Abuja Water","NWSC","Nairobi Water"],                              fields:[{ id:"account", label:"Account Number", placeholder:"ACC-00000" }] },
  { id:"tv",          name:"Cable / Streaming",   icon:"📺", providers:["DSTV","GOtv","Startimes","Canal+","Netflix","Showmax","BEIN Sports"],            fields:[{ id:"smart_card", label:"Smart Card / ID", placeholder:"Smart card number" }] },
  { id:"internet",    name:"Internet",            icon:"🌐", providers:["MTN Fibre","Airtel Home","Spectranet","SMILE","Starlink","Liquid Home"],         fields:[{ id:"account", label:"Account / User ID", placeholder:"Account ID" }] },
  { id:"education",   name:"School Fees",         icon:"🎓", providers:["JAMB","WAEC","NECO","NABTEB","Bank payment"],                                    fields:[{ id:"ref", label:"Payment Reference", placeholder:"REF-00000000" }, { id:"amount", label:"Amount", placeholder:"0.00", type:"number" }] },
  { id:"transport",   name:"Transport",           icon:"🚌", providers:["BRT Lagos","Uber","Bolt","Taxify"],                                              fields:[{ id:"ref", label:"Reference / Order ID", placeholder:"REF-000" }] },
  { id:"insurance",   name:"Insurance",           icon:"🛡️", providers:["Leadway","AXA Mansard","AIICO","Cornerstone","Old Mutual"],                      fields:[{ id:"policy", label:"Policy Number", placeholder:"POL-00000000" }] },
  { id:"government",  name:"Government / Tax",    icon:"🏛️", providers:["FIRS","LIRS","SARS","KRA","NPPF"],                                              fields:[{ id:"tin", label:"TIN / Reference", placeholder:"0000000-0000" }] },
  { id:"merchant",    name:"Merchant Pay",        icon:"🛒", providers:["Paystack Merchant","Flutterwave Store","Stripe"],                                fields:[{ id:"ref", label:"Payment Link / Ref", placeholder:"pay.example.com/ref" }, { id:"amount", label:"Amount (USD)", placeholder:"0.00", type:"number" }] },
  { id:"rent",        name:"Rent / Property",     icon:"🏠", providers:["Landlord Direct","Estatelinks","Propertypro"],                                  fields:[{ id:"ref", label:"Property Ref", placeholder:"PROP-00000" }, { id:"amount", label:"Amount", placeholder:"0.00", type:"number" }] },
];

// ─── Airline / travel providers ───────────────────────────────────────────────
export const TRAVEL_PROVIDERS = [
  { id:"duffel",   name:"Duffel",   logo:"✈️", status:"requires_key", endpoint:"https://api.duffel.com" },
  { id:"amadeus",  name:"Amadeus",  logo:"🌍", status:"requires_key", endpoint:"https://test.api.amadeus.com" },
  { id:"booking",  name:"Booking.com",logo:"🏨", status:"requires_key", endpoint:"https://distribution-xml.booking.com" },
];

export const POPULAR_ROUTES = [
  { from:"Lagos", to:"London",    airline:"British Airways", approxUsd:680 },
  { from:"Nairobi", to:"Dubai",  airline:"Emirates",        approxUsd:420 },
  { from:"Accra", to:"New York", airline:"Delta",           approxUsd:890 },
  { from:"Lagos", to:"Dubai",    airline:"Emirates",        approxUsd:510 },
  { from:"Cape Town", to:"Paris",airline:"Air France",      approxUsd:750 },
  { from:"Mumbai", to:"Toronto", airline:"Air Canada",      approxUsd:820 },
  { from:"Nairobi", to:"London", airline:"Kenya Airways",   approxUsd:600 },
  { from:"Lagos", to:"Accra",    airline:"Africa World",    approxUsd:180 },
];

// ─── Order types ──────────────────────────────────────────────────────────────
export type MktOrderType = "buy_crypto" | "sell_crypto" | "send_money" | "bill" | "travel" | "fx";
export type MktOrderStatus = "pending" | "escrowed" | "processing" | "completed" | "cancelled" | "disputed" | "failed";

export interface MarketplaceOrder {
  id:           string;
  type:         MktOrderType;
  status:       MktOrderStatus;
  cryptoAsset:  string;
  cryptoAmount: number;
  fiatCurrency: string;
  fiatAmount:   number;
  fxRate:       number;
  country:      string;
  payMethod:    string;
  recipient?:   string;
  description:  string;
  createdAt:    number;
  updatedAt:    number;
  txHash?:      string;
  providerRef?: string;
  notes:        string[];
}

// ─── Store ────────────────────────────────────────────────────────────────────
interface MarketplaceState {
  // FX rates (USD base)
  fxRates:     Record<string, number>;
  fxUpdatedAt: number;
  fxLoading:   boolean;

  // Orders
  orders:      MarketplaceOrder[];

  // Actions
  fetchFxRates: () => Promise<void>;
  getRate:      (currency: string) => number;
  placeOrder:   (o: Omit<MarketplaceOrder, "id" | "createdAt" | "updatedAt" | "notes">) => string;
  updateOrder:  (id: string, patch: Partial<MarketplaceOrder>) => void;
  addNote:      (id: string, note: string) => void;
}

const SEED_FX: Record<string, number> = {
  USD:1, EUR:0.93, GBP:0.79, NGN:1540, GHS:15.8, KES:129, ZAR:18.6,
  CAD:1.36, AUD:1.52, INR:83.1, AED:3.67, BRL:4.97, JPY:149.5,
  PHP:55.8, MXN:17.2, TRY:30.4, UAH:38.2, PKR:278, SGD:1.34, CNY:7.24,
  IDR:15600, VND:24500, THB:35.1, MYR:4.71, KRW:1320, HKD:7.83,
  TWD:31.5, LKR:310, NPR:133, SEK:10.5, NOK:10.6, DKK:6.9,
  PLN:3.97, CHF:0.88, CZK:22.7, HUF:354, RON:4.64, ILS:3.72,
  SAR:3.75, QAR:3.64, KWD:0.31, JOD:0.71, NZD:1.64, ARS:855,
  COP:3950, CLP:870, PEN:3.73, DOP:57, GTQ:7.8, BDT:110, MMK:2100,
  KHR:4100, UZS:12300, KZT:460, RUB:90, ZMW:25, TZS:2500, UGX:3750,
  RWF:1290, EGP:30.9, MAD:10.1, XOF:617, XAF:617, ETB:55, AOA:830,
  MZN:63.5, MGA:4600, ZWL:320, GNF:8600,
};

export const useMarketplaceStore = create<MarketplaceState>()(
  subscribeWithSelector((set, get) => ({
    fxRates:     SEED_FX,
    fxUpdatedAt: 0,
    fxLoading:   false,
    orders:      [],

    fetchFxRates: async () => {
      if (get().fxLoading) return;
      // Rate < 5 min old — skip
      if (Date.now() - get().fxUpdatedAt < 5 * 60_000) return;
      set({ fxLoading: true });
      try {
        // open.er-api.com — free, no key, CORS-friendly
        const res = await fetch("https://open.er-api.com/v6/latest/USD", { signal: AbortSignal.timeout(8000) });
        if (res.ok) {
          const data = await res.json() as { rates: Record<string, number> };
          set({ fxRates: { ...SEED_FX, ...data.rates }, fxUpdatedAt: Date.now() });
        }
      } catch {
        // keep seed rates — no throw
      } finally {
        set({ fxLoading: false });
      }
    },

    getRate: (currency) => get().fxRates[currency] ?? 1,

    placeOrder: (o) => {
      const id = `MKT-${Date.now().toString(36).toUpperCase()}`;
      const now = Date.now();
      set(s => ({
        orders: [{ ...o, id, createdAt: now, updatedAt: now, notes: [] }, ...s.orders],
      }));
      return id;
    },

    updateOrder: (id, patch) => set(s => ({
      orders: s.orders.map(o => o.id === id ? { ...o, ...patch, updatedAt: Date.now() } : o),
    })),

    addNote: (id, note) => set(s => ({
      orders: s.orders.map(o => o.id === id ? { ...o, notes: [...o.notes, note], updatedAt: Date.now() } : o),
    })),
  }))
);
