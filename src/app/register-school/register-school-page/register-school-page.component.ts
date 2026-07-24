import { Component, OnInit, ViewChild } from '@angular/core';
import { LoadingService } from '../../services/loading.service';
import { Router } from '@angular/router';
import { SettingsService } from 'src/app/services/settings.service';
import { TranslateService } from '@ngx-translate/core';
import { environment } from 'src/environments/environment';
import { IonAccordionGroup, IonSlides } from '@ionic/angular';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { Geolocation } from '@capacitor/geolocation';
import { LocationService } from 'src/app/services/location.service';

@Component({
  selector: 'app-register-school-page',
  templateUrl: './register-school-page.component.html',
  styleUrls: ['./register-school-page.component.scss'],
  standalone: false,
})
export class RegisterSchoolPageComponent implements OnInit {
  @ViewChild(IonAccordionGroup, { static: true })
  accordionGroup: IonAccordionGroup;

  @ViewChild('mySlider') slides: IonSlides;

  schools: any;
  schoolId: any;

  slideOpts = {
    initialSlide: 0,
    speed: 400,
    pagination: {
      el: '.swiper-pagination',
      clickable: true,
    },
    watchSlidesProgress: true,
    observeSlideChildren: true,
    observer: true,
    observeParents: true,
  };

  isFirst = true;
  isLast = false;
  appName = environment.appName;
  privacyUrl1 = 'https://opendatacommons.org/licenses/odbl/1-0/';
  privacyUrl2 = 'https://www.measurementlab.net/privacy/';
  targetUrl = '_blank';
  isNative: boolean;

  private _isPrivacyChecked = false;

  get isPrivacyChecked(): boolean {
    return this._isPrivacyChecked;
  }

  set isPrivacyChecked(value: boolean) {
    this._isPrivacyChecked = value;

    if (value) {
      this.handlePrivacyChecked();
    }
  }

  constructor(
    public loading: LoadingService,
    private readonly router: Router,
    private settingsService: SettingsService,
    private translate: TranslateService,
    private locationService: LocationService,
  ) {
    const appLang = this.settingsService.get('applicationLanguage');
    this.translate.use(appLang.code);
    this.isNative = Capacitor.isNativePlatform();
  }

  ngOnInit() {}

  private async handlePrivacyChecked() {
    if (!Capacitor.isNativePlatform()) return;

    try {
      const permissionStatus = await Geolocation.checkPermissions();
      this.locationService.setLocationPermissionAskedStatus(true);

      if (
        permissionStatus.location === 'prompt' ||
        permissionStatus.location === 'prompt-with-rationale'
      ) {
        await Geolocation.requestPermissions();
      }
    } catch (error) {
      console.error('Location permission check/request failed', error);
    }
  }

  swipeNext() {
    this.slides.slideNext();
  }

  reachedEnd() {
    this.isLast = true;
  }

  isNativeApp(): boolean {
    return Capacitor.isNativePlatform();
  }

  moveToStartTest() {
    const translatedText = this.translate.instant('searchCountry.check');

    const loadingMsg =
      // eslint-disable-next-line max-len
      `<div class="loadContent"><ion-img src="assets/loader/new_loader.gif" class="loaderGif"></ion-img><p class="green_loader" >${translatedText}</p></div>`;
    this.loading.present(loadingMsg, 3000, 'pdcaLoaderClass', 'null');
    this.router.navigate(['/searchcountry']);
  }

  redirectToCountry() {
    const translatedText = this.translate.instant('searchCountry.check');

    const loadingMsg =
      // eslint-disable-next-line max-len
      `<div class="loadContent"><ion-img src="assets/loader/new_loader.gif" class="loaderGif"></ion-img><p class="green_loader" >${translatedText}</p></div>`;
    this.loading.present(loadingMsg, 3000, 'pdcaLoaderClass', 'null');
    this.router.navigate(['/searchcountry']);
  }

  openExternalUrl(href) {
    if (Capacitor.isNativePlatform()) {
      this.openNativeAppBrowser(href);
    } else {
      this.settingsService.getShell().shell.openExternal(href);
    }
  }

  async openNativeAppBrowser(href) {
    await Browser.open({
      url: href,
      windowName: '_system',
    });
  }

  async checkCurrentSlide() {
    const index = await this.slides.getActiveIndex();
    const total = await this.slides.length();

    this.isFirst = index === 0;
    this.isLast = index === total - 1;
    console.log(this.isFirst, this.isLast, index);
  }

  updatePaginationIndexClass(index: number) {
    const paginationEl = document.querySelector('.swiper-pagination');
    if (paginationEl) {
      paginationEl.classList.forEach((cls) => {
        if (cls.startsWith('index-')) {
          paginationEl.classList.remove(cls);
        }
      });

      paginationEl.classList.add(`index-${index}`);
    }
  }

  handleBackClick() {
    this.slides.getActiveIndex().then((index) => {
      if (index === 0) {
        this.router.navigate(['/home']);
      } else {
        this.slides.slidePrev();
      }
    });
  }
}
