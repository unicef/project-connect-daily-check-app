import { Component, ViewChild } from '@angular/core';
import { IonAccordionGroup } from '@ionic/angular';

@Component({
  selector: 'app-searchcountry',
  templateUrl: 'searchcountry.page.html',
  styleUrls: ['searchcountry.page.scss'],
})
export class SearchcountryPage {
  @ViewChild(IonAccordionGroup, { static: true }) accordionGroup: IonAccordionGroup;
  constructor() {}

}
