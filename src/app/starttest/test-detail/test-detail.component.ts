import { Component, OnInit } from '@angular/core';
import { CountryService } from 'src/app/services/country.service';
import { HistoryService } from 'src/app/services/history.service';
import { StorageService } from 'src/app/services/storage.service';
import { Router, NavigationEnd } from '@angular/router';
import { LocationService } from 'src/app/services/location.service';
import { SettingsService } from 'src/app/services/settings.service';
import {
  MeasurementSortKey,
  ParsedMeasurementRow,
  SortDirection,
  parseMeasurementRows,
  sortMeasurementRows,
} from 'src/app/services/measurement.utils';

@Component({
  selector: 'app-test-detail',
  templateUrl: './test-detail.component.html',
  styleUrls: ['./test-detail.component.scss'],
  standalone: false,
})
export class TestDetailComponent implements OnInit {
  schoolId: string;
  school: any;
  historicalData: any;
  measurementsData: ParsedMeasurementRow[] = [];
  locationDetail: any;
  selectedCountry: any;
  sortKey: MeasurementSortKey = 'timestamp';
  sortDirection: SortDirection = 'desc';

  constructor(
    private storage: StorageService,
    private historyService: HistoryService,
    private countryService: CountryService,
    private router: Router,
    private locationService: LocationService,
    private settingsService: SettingsService
  ) {
    this.router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) {
        this.loadData();
      }
    });
    this.locationDetail = this.locationService.getSavedGeolocation();
  }

  ngOnInit() {
    if (this.storage.get('schoolId')) {
      this.school = JSON.parse(this.storage.get('schoolInfo'));
      this.countryService.getPcdcCountryByCode(this.school.country).subscribe(
        (response) => {
          this.selectedCountry = response[0].name;
        },
        (err) => {
          console.log('ERROR: ' + err);
        }
      );
    }
    this.loadData();
  }

  loadData() {
    this.schoolId = this.storage.get('schoolId');

    if (this.storage.get('historicalDataAll')) {
      this.historicalData = JSON.parse(this.storage.get('historicalDataAll'));
      const allMeasurements = this.historicalData.measurements ?? [];

      const parsed = parseMeasurementRows(
        allMeasurements
          .slice()
          .sort(
            (a, b) =>
              new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
          )
          .slice(0, 10)
      );

      this.measurementsData = sortMeasurementRows(
        parsed,
        this.sortKey,
        this.sortDirection
      );
    } else {
      const historicalData = this.historyService.get();
      const allMeasurements = historicalData?.measurements ?? [];
      const parsed = parseMeasurementRows(
        allMeasurements
          .slice()
          .sort(
            (a, b) =>
              new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
          )
          .slice(0, 10)
      );
      this.measurementsData = sortMeasurementRows(
        parsed,
        this.sortKey,
        this.sortDirection
      );
    }
  }

  onSortColumn(key: MeasurementSortKey): void {
    if (this.sortKey === key) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortKey = key;
      this.sortDirection = key === 'timestamp' ? 'desc' : 'asc';
    }
    this.measurementsData = sortMeasurementRows(
      this.measurementsData,
      this.sortKey,
      this.sortDirection
    );
  }

  getSortIndicator(key: MeasurementSortKey): string {
    if (this.sortKey !== key) {
      return '↕';
    }
    return this.sortDirection === 'asc' ? '↑' : '↓';
  }

  openExternalUrl() {
    this.settingsService.openExternalUrl(
      'https://www.google.com/maps?q=' +
        this.locationDetail?.location?.lat +
        ',' +
        this.locationDetail?.location?.lng
    );
  }
}
