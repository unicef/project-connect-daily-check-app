import { Component, ViewChild } from '@angular/core';
import { IonAccordionGroup } from '@ionic/angular';

@Component({
  selector: 'app-searchschool',
  templateUrl: 'searchschool.page.html',
  styleUrls: ['searchschool.page.scss'],
})
export class SearchschoolPage {
  @ViewChild(IonAccordionGroup, { static: true }) accordionGroup: IonAccordionGroup;
  constructor() {}

}
