import {
  BadRequestException,
  Controller,
  Get,
  Headers,
  Param,
  Query,
  Redirect,
  Res,
} from '@nestjs/common';
import axios from 'axios';
import * as cheerio from 'cheerio';
import puppeteer from 'puppeteer';
import { AppService } from './app.service';
import type { Response } from 'express';

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
  redirectToGoods(
    @Param('id') id: string,
    @Headers('user-agent') userAgent = '',
    @Res() res: Response,
  ) {
    console.log('redirectToGoods user-agent:', userAgent);

    const isMobileClient = /iPhone|iPad|iPod|Android/i.test(userAgent);
    const webUrl = `https://www.kurly.com/goods/${id}`;
    const deepLink = `kurly://product?no=${id}&referrer=select_related_product`;

    if (!isMobileClient) {
      return res.redirect(301, webUrl);
    }

    const html = `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <title>Kurly 상품으로 이동 중...</title>
    <script>
      (function () {
        var fallbackUrl = '${webUrl}';
        var deepLinkUrl = '${deepLink}';
        var fallbackTimer = setTimeout(function () {
          window.location.replace(fallbackUrl);
        }, 1500);

        window.location.href = deepLinkUrl;

        document.addEventListener('visibilitychange', function () {
          if (document.hidden) {
            clearTimeout(fallbackTimer);
          }
        });
      })();
    </script>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; text-align: center; margin: 3rem 1rem; }
    </style>
  </head>
  <body>
    <p>컬리 앱을 여는 중입니다. 자동으로 이동하지 않으면 <a href="${webUrl}">여기</a>를 눌러주세요.</p>
  </body>
</html>`;

    return res.status(200).type('text/html').send(html);
  }

  @Get('/goods-test/:id')
  @Redirect(undefined, 301)
  redirectToGoodsTest(
    @Param('id') id: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    console.log('redirectToGoodsTest user-agent:', userAgent);

    const isIosMobile =
      typeof userAgent === 'string' && /iPhone|iPad|iPod/i.test(userAgent);
    const isAndroidMobile =
      typeof userAgent === 'string' && /Android/i.test(userAgent);

    const shouldUseDeepLink = isIosMobile || isAndroidMobile;
    const deepLink = `kurly://product?no=${id}&referrer=select_related_product`;
    const webUrl = `https://www.kurly.com/goods/${id}`;

    return { url: shouldUseDeepLink ? deepLink : webUrl };
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
