import { Component, ViewChild } from '@angular/core';
import { IonAccordionGroup } from '@ionic/angular';
import { ActivatedRoute, Router } from '@angular/router';
import { LoadingService } from '../services/loading.service';
import { TranslateService } from '@ngx-translate/core';

@Component({
  selector: 'app-invalidlocation',
  templateUrl: 'invalidlocation.page.html',
  styleUrls: ['invalidlocation.page.scss'],
})
export class InvalidLocationPage {
  @ViewChild(IonAccordionGroup, { static: true })
  accordionGroup: IonAccordionGroup;
  schools: any;
  schoolId: any;
  selectedCountry: any;
  country: any;
  sub: any;
  constructor(
    private activatedroute: ActivatedRoute,
    public router: Router,
    public loading: LoadingService,
    private translate: TranslateService
  ) {
    this.sub = this.activatedroute.params.subscribe((params) => {
      this.schoolId = params.schoolId;
      this.selectedCountry = params.selectedCountry;
      this.country = params.country;
    });
  }
}
