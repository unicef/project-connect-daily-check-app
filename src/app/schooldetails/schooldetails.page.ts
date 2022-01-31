import { Component, ViewChild } from '@angular/core';
import { IonAccordionGroup } from '@ionic/angular';

@Component({
  selector: 'app-schooldetails',
  templateUrl: 'schooldetails.page.html',
  styleUrls: ['schooldetails.page.scss'],
})
export class SchooldetailsPage {
  @ViewChild(IonAccordionGroup, { static: true }) accordionGroup: IonAccordionGroup;
  constructor() {}

}
