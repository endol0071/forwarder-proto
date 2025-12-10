import {
  BadRequestException,
  Controller,
  Get,
  Headers,
  Param,
  Query,
  Redirect,
} from '@nestjs/common';
import axios from 'axios';
import * as cheerio from 'cheerio';
import puppeteer from 'puppeteer';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('/og')
  async getOg(@Query('url') url?: string) {
    const targetUrl = url || 'https://www.kurly.com/goods/5061259';

    const { data: html } = await axios.get(targetUrl, {
      timeout: 8000,
      maxRedirects: 5,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; OGTester/1.0)',
      },
    });

    const $ = cheerio.load(html);
    const get = (selector: string) => $(selector).attr('content') || undefined;

    const title =
      get('meta[property="og:title"]') || $('title').text() || undefined;

    const description =
      get('meta[property="og:description"]') || get('meta[name="description"]');

    const image = get('meta[property="og:image"]');
    const ogUrl = get('meta[property="og:url"]') || targetUrl;
    const siteName = get('meta[property="og:site_name"]');

    return { title, description, image, url: ogUrl, siteName };
  }

  @Get('/og/browser')
  async getOgWithPuppeteer(@Query('url') url?: string) {
    const targetUrl = url || 'https://www.kurly.com/goods/5061259';
    const browser = await puppeteer.launch({
      headless: true,
      channel: 'chrome',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
      const page = await browser.newPage();
      await page.setUserAgent('Mozilla/5.0 (compatible; OGTester/1.0)');
      await page.goto(targetUrl, {
        waitUntil: 'networkidle2',
      });

      const metadata = await page.evaluate((fallbackUrl) => {
        const get = (selector: string) =>
          document.querySelector(selector)?.getAttribute('content') ||
          undefined;

        const title =
          get('meta[property="og:title"]') ||
          document.querySelector('title')?.textContent ||
          undefined;

        const description =
          get('meta[property="og:description"]') ||
          get('meta[name="description"]');

        const image = get('meta[property="og:image"]');
        const ogUrl = get('meta[property="og:url"]') || fallbackUrl;
        const siteName = get('meta[property="og:site_name"]');

        return { title, description, image, url: ogUrl, siteName };
      }, targetUrl);

      return metadata;
    } catch (error) {
      return {
        error: (error as Error).message,
        hint: 'Ensure Chrome is installed locally or install a bundled Chromium via `pnpm exec puppeteer browsers install chrome`.',
      };
    } finally {
      await browser.close();
    }
  }

  @Get('/goods/:id')
  @Redirect(undefined, 301)
  redirectToGoods(
    @Param('id') id: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    console.log('redirectToGoods user-agent:', userAgent);

    const isIosMobile =
      typeof userAgent === 'string' && /iPhone|iPad|iPod/i.test(userAgent);
    const isAndroidMobile =
      typeof userAgent === 'string' && /Android/i.test(userAgent);

    const shouldUseDeepLink = isIosMobile || isAndroidMobile;

    const url = shouldUseDeepLink
      ? `kurly://product?no=${id}&referrer=select_related_product`
      : `https://www.kurly.com/goods/${id}`;

    return { url };
  }

  @Get('/redirect')
  @Redirect(undefined, 301)
  redirectToCustomUrl(
    @Query('to') to?: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    if (!to) {
      throw new BadRequestException('`to` query parameter is required.');
    }

    console.log('redirectToCustomUrl user-agent:', userAgent);
    return { url: to };
  }
}
