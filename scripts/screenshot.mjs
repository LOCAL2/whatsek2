import puppeteer from 'puppeteer'
import { writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const outDir = join(__dirname, '../public')
const outFile = join(outDir, 'whatsek-preview.jpg')

mkdirSync(outDir, { recursive: true })

console.log('Launching browser...')
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage()
await page.setViewport({ width: 1280, height: 800 })

console.log('Navigating to whatsek.com...')
await page.goto('http://whatsek.com/', { waitUntil: 'networkidle2', timeout: 30000 })

console.log('Taking screenshot...')
const buffer = await page.screenshot({ type: 'jpeg', quality: 85, clip: { x: 0, y: 0, width: 1280, height: 800 } })
writeFileSync(outFile, buffer)

await browser.close()
console.log(`Saved to ${outFile}`)
