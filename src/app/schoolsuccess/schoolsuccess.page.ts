import { Component, ViewChild } from '@angular/core';
import { IonAccordionGroup } from '@ionic/angular';
import { Router } from '@angular/router';
import { LoadingService } from '../services/loading.service';
import { IonSlides } from '@ionic/angular';
import { TranslateService } from '@ngx-translate/core';
import { SettingsService } from '../services/settings.service';
import { environment } from 'src/environments/environment';
import { MeasurementClientService } from '../services/measurement-client.service';
import { Capacitor } from '@capacitor/core';

@Component({
  selector: 'app-schoolsuccess',
  templateUrl: 'schoolsuccess.page.html',
  styleUrls: ['schoolsuccess.page.scss'],
  standalone: false,
})
export class SchoolsuccessPage {
  @ViewChild(IonAccordionGroup, { static: true })
  accordionGroup: IonAccordionGroup;
  @ViewChild('mySlider') slides: IonSlides;
  schools: any;
  schoolId: any;
  slideOpts = {
    initialSlide: 0,
    speed: 400,
    pagination: {
      el: '.swiper-pagination', // target class for bullets
      clickable: true,
    },
  };
  isLast = false;
  appName = environment.appName;
  isNative: boolean;

  constructor(
    public loading: LoadingService,
    private router: Router,
    private translate: TranslateService,
    private settingsService: SettingsService,
    private measurementClientService: MeasurementClientService,
  ) {
    const appLang = this.settingsService.get('applicationLanguage');
    this.translate.use(appLang.code);
    this.isNative = Capacitor.getPlatform() === 'android';
  }
  swipeNext() {
    this.slides.slideNext();
  }
  reachedEnd() {
    this.isLast = true;
  }

  isNativeApp(): boolean {
    return Capacitor.getPlatform() === 'android';
  }

  async checkCurrentSlide() {
    const index = await this.slides.getActiveIndex();
    const total = await this.slides.length(); // Total number of slides

    this.isLast = index === total - 1;
  }
  moveToStartTest() {
    // this.measurementClientService.runTest(
    //   'registration',
    // );
    this.router.navigate(['starttest']);
  }
}
