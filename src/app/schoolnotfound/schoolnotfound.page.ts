import { Component, ViewChild } from '@angular/core';
import { IonAccordionGroup, NavController } from '@ionic/angular';
import { ActivatedRoute, Router } from '@angular/router';
import { LoadingService } from '../services/loading.service';
import { NotFound } from './types';
import { TranslateService } from '@ngx-translate/core';
import { SettingsService } from '../services/settings.service';
import { environment } from 'src/environments/environment';

@Component({
    selector: 'app-schoolnotfound',
    templateUrl: 'schoolnotfound.page.html',
    styleUrls: ['schoolnotfound.page.scss'],
    standalone: false
})
export class SchoolnotfoundPage {
  @ViewChild(IonAccordionGroup, { static: true })
  accordionGroup: IonAccordionGroup;
  readonly NotFound = NotFound;
  schools: any;
  schoolId: any;
  sub: any;
  querySub: any;
  selectedCountry: any;
  detectedCountry: any;
  selectedCountryName: any
  /** Why the flow ended here; drives the icon, copy and "Try again" action. */
  reason: NotFound = NotFound.notFound;
  appName = environment.appName;
  constructor(
    private activatedroute: ActivatedRoute,
    public router: Router,
    public loading: LoadingService,
    private translate: TranslateService,
    private settingsService: SettingsService,
    private navCtrl: NavController
  ) {
    const appLang = this.settingsService.get('applicationLanguage');
    this.translate.use(appLang.code);

    this.querySub = this.activatedroute.queryParams.subscribe((query) => {
      this.reason = Object.values(NotFound).includes(query.reason)
        ? query.reason
        : NotFound.notFound;
    });
    this.sub = this.activatedroute.params.subscribe((params) => {
      this.schoolId = params.schoolId;
      this.selectedCountry = params.selectedCountry;
      this.detectedCountry = params.detectedCountry;
      this.selectedCountryName = params.selectedCountryName
      console.log(this.selectedCountry);
    });
  }

  /** The search answered with no match: the ID itself is the problem. */
  get isNotFound(): boolean {
    return this.reason === NotFound.notFound;
  }

  /**
   * Not-found sends the user back to type another ID; a removed registration
   * starts registration over; every other reason was a failed attempt, so go
   * back to the step that failed and let the user run it again.
   */
  tryAgain() {
    if (this.isNotFound) {
      this.backToSearchDetail();
    } else if (this.reason === NotFound.notRegister) {
      this.router.navigate(['/home']);
    } else {
      this.navCtrl.back();
    }
  }

  backToSearchDetail() {
    if (this.reason === NotFound.notRegister) {
      this.router.navigate(['/home']);
      return;
    }
    this.router.navigate(
      [
        'searchschool',
        this.selectedCountry,
        this.detectedCountry,
        this.selectedCountryName
      ]);
  }

  ngOnDestroy() {
    this.sub?.unsubscribe();
    this.querySub?.unsubscribe();
  }
}
