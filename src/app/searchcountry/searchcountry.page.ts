/* eslint-disable @typescript-eslint/naming-convention */
import { Component, ViewChild } from '@angular/core';
import { IonAccordionGroup } from '@ionic/angular';
import { NetworkService } from '../services/network.service';
import { StorageService } from '../services/storage.service';
import { LoadingService } from '../services/loading.service';
import { SettingsService } from '../services/settings.service';

import { ActivatedRoute, Router } from '@angular/router';
import { Country } from '../shared/country.model';
import { CountryService } from '../services/country.service';
import { TranslateService } from '@ngx-translate/core';
import { environment } from 'src/environments/environment';
@Component({
  selector: 'app-searchcountry',
  templateUrl: 'searchcountry.page.html',
  styleUrls: ['searchcountry.page.scss'],
})
export class SearchcountryPage {
  @ViewChild(IonAccordionGroup, { static: true })
  accordionGroup: IonAccordionGroup;
  detectedCountry: any;
  selectedCountry: any;
  isPcdcCountry: any;
  pcdcCountry: any;
  selectedCountryName: any;
  countries: Country[] = [
    {
      name: 'Afghanistan',
      code: 'AF',
    },
    {
      name: 'Åland Islands',
      code: 'AX',
    },
    {
      name: 'Albania',
      code: 'AL',
    },
    {
      name: 'Algeria',
      code: 'DZ',
    },
    {
      name: 'Andorra',
      code: 'AD',
    },
    {
      name: 'Angola',
      code: 'AO',
    },
    {
      name: 'Anguilla',
      code: 'AI',
    },
    {
      name: 'Antarctica',
      code: 'AQ',
    },
    {
      name: 'Antigua and Barbuda',
      code: 'AG',
    },
    {
      name: 'Argentina',
      code: 'AR',
    },
    {
      name: 'Armenia',
      code: 'AM',
    },
    {
      name: 'Aruba',
      code: 'AW',
    },
    {
      name: 'Australia',
      code: 'AU',
    },
    {
      name: 'Austria',
      code: 'AT',
    },
    {
      name: 'Azerbaijan',
      code: 'AZ',
    },
    {
      name: 'Bahamas',
      code: 'BS',
    },
    {
      name: 'Bahrain',
      code: 'BH',
    },
    {
      name: 'Bangladesh',
      code: 'BD',
    },
    {
      name: 'Barbados',
      code: 'BB',
    },
    {
      name: 'Belarus',
      code: 'BY',
    },
    {
      name: 'Belgium',
      code: 'BE',
    },
    {
      name: 'Belize',
      code: 'BZ',
    },
    {
      name: 'Benin',
      code: 'BJ',
    },
    {
      name: 'Bermuda',
      code: 'BM',
    },
    {
      name: 'Bhutan',
      code: 'BT',
    },
    {
      name: 'Bolivia (Plurinational State of)',
      code: 'BO',
    },
    {
      name: 'Bonaire',
      code: 'BQ',
    },
    {
      name: 'Bosnia and Herzegovina',
      code: 'BA',
    },
    {
      name: 'Botswana',
      code: 'BW',
    },
    {
      name: 'Bouvet Island',
      code: 'BV',
    },
    {
      name: 'Brazil',
      code: 'BR',
    },
    {
      name: 'British Virgin Islands',
      code: 'VG',
    },
    {
      name: 'Brunei Darussalam',
      code: 'BN',
    },
    {
      name: 'Bulgaria',
      code: 'BG',
    },
    {
      name: 'Burkina Faso',
      code: 'BF',
    },
    {
      name: 'Burundi',
      code: 'BI',
    },
    {
      name: 'Cabo Verde',
      code: 'CV',
    },
    {
      name: 'Cambodia',
      code: 'KH',
    },
    {
      name: 'Cameroon',
      code: 'CM',
    },
    {
      name: 'Canada',
      code: 'CA',
    },
    {
      name: 'Cayman Islands',
      code: 'KY',
    },
    {
      name: 'Central African Republic',
      code: 'CF',
    },
    {
      name: 'Chad',
      code: 'TD',
    },
    {
      name: 'Chagos Archipelagio',
      code: 'IO',
    },
    {
      name: 'Chile',
      code: 'CL',
    },
    {
      name: 'China',
      code: 'CN',
    },
    {
      name: 'Christmas Island',
      code: 'CX',
    },
    {
      name: 'Cocos (Keeling) Islands',
      code: 'CC',
    },
    {
      name: 'Colombia',
      code: 'CO',
    },
    {
      name: 'Comoros',
      code: 'KM',
    },
    {
      name: 'Congo',
      code: 'CG',
    },
    {
      name: 'Cook Islands',
      code: 'CK',
    },
    {
      name: 'Costa Rica',
      code: 'CR',
    },
    {
      // eslint-disable-next-line @typescript-eslint/quotes
      name: "Côte d'Ivoire",
      code: 'CI',
    },
    {
      name: 'Croatia',
      code: 'HR',
    },
    {
      name: 'Cuba',
      code: 'CU',
    },
    {
      name: 'Curaçao',
      code: 'CW',
    },
    {
      name: 'Cyprus',
      code: 'CY',
    },
    {
      name: 'Czechia',
      code: 'CZ',
    },
    {
      // eslint-disable-next-line @typescript-eslint/quotes
      name: "Democratic People's Republic of Korea",
      code: 'KP',
    },
    {
      name: 'Democratic Republic of the Congo',
      code: 'CD',
    },
    {
      name: 'Denmark',
      code: 'DK',
    },
    {
      name: 'Djibouti',
      code: 'DJ',
    },
    {
      name: 'Dominica',
      code: 'DM',
    },
    {
      name: 'Dominican Republic',
      code: 'DO',
    },
    {
      name: 'Ecuador',
      code: 'EC',
    },
    {
      name: 'Egypt',
      code: 'EG',
    },
    {
      name: 'El Salvador',
      code: 'SV',
    },
    {
      name: 'Equatorial Guinea',
      code: 'GQ',
    },
    {
      name: 'Eritrea',
      code: 'ER',
    },
    {
      name: 'Estonia',
      code: 'EE',
    },
    {
      name: 'Eswatini',
      code: 'SZ',
    },
    {
      name: 'Ethiopia',
      code: 'ET',
    },
    {
      name: 'Falkland Islands (Malvinas)',
      code: 'FK',
    },
    {
      name: 'Faroe Islands',
      code: 'FO',
    },
    {
      name: 'Fiji',
      code: 'FJ',
    },
    {
      name: 'Finland',
      code: 'FI',
    },
    {
      name: 'France',
      code: 'FR',
    },
    {
      name: 'French Guiana',
      code: 'GF',
    },
    {
      name: 'French Polynesia',
      code: 'PF',
    },
    {
      name: 'French Southern Territories',
      code: 'TF',
    },
    {
      name: 'Gabon',
      code: 'GA',
    },
    {
      name: 'Gambia',
      code: 'GM',
    },
    {
      name: 'Georgia',
      code: 'GE',
    },
    {
      name: 'Germany',
      code: 'DE',
    },
    {
      name: 'Ghana',
      code: 'GH',
    },
    {
      name: 'Gibraltar',
      code: 'GI',
    },
    {
      name: 'Greece',
      code: 'GR',
    },
    {
      name: 'Greenland',
      code: 'GL',
    },
    {
      name: 'Grenada',
      code: 'GD',
    },
    {
      name: 'Guadeloupe',
      code: 'GP',
    },
    {
      name: 'Guam',
      code: 'GU',
    },
    {
      name: 'Guatemala',
      code: 'GT',
    },
    {
      name: 'Guernsey',
      code: 'GG',
    },
    {
      name: 'Guinea',
      code: 'GN',
    },
    {
      name: 'Guinea-Bissau',
      code: 'GW',
    },
    {
      name: 'Guyana',
      code: 'GY',
    },
    {
      name: 'Haiti',
      code: 'HT',
    },
    {
      name: 'Heard Island and McDonald Islands',
      code: 'HM',
    },
    {
      name: 'Holy See',
      code: 'VA',
    },
    {
      name: 'Honduras',
      code: 'HN',
    },
    {
      name: 'Hong Kong',
      code: 'HK',
    },
    {
      name: 'Hungary',
      code: 'HU',
    },
    {
      name: 'Iceland',
      code: 'IS',
    },
    {
      name: 'India',
      code: 'IN',
    },
    {
      name: 'Indonesia',
      code: 'ID',
    },
    {
      name: 'Iran (Islamic Republic of)',
      code: 'IR',
    },
    {
      name: 'Iraq',
      code: 'IQ',
    },
    {
      name: 'Ireland',
      code: 'IE',
    },
    {
      name: 'Isle of Man',
      code: 'IM',
    },
    {
      name: 'Israel',
      code: 'IL',
    },
    {
      name: 'Italy',
      code: 'IT',
    },
    {
      name: 'Jamaica',
      code: 'JM',
    },
    {
      name: 'Japan',
      code: 'JP',
    },
    {
      name: 'Jersey',
      code: 'JE',
    },
    {
      name: 'Jordan',
      code: 'JO',
    },
    {
      name: 'Kazakhstan',
      code: 'KZ',
    },
    {
      name: 'Kenya',
      code: 'KE',
    },
    {
      name: 'Kiribati',
      code: 'KI',
    },
    {
      name: 'Kosovo',
      code: 'XK',
    },
    {
      name: 'Kuwait',
      code: 'KW',
    },
    {
      name: 'Kyrgyzstan',
      code: 'KG',
    },
    {
      // eslint-disable-next-line @typescript-eslint/quotes
      name: "Lao People's Democratic Republic",
      code: 'LA',
    },
    {
      name: 'Latvia',
      code: 'LV',
    },
    {
      name: 'Lebanon',
      code: 'LB',
    },
    {
      name: 'Lesotho',
      code: 'LS',
    },
    {
      name: 'Liberia',
      code: 'LR',
    },
    {
      name: 'Libya',
      code: 'LY',
    },
    {
      name: 'Liechtenstein',
      code: 'LI',
    },
    {
      name: 'Lithuania',
      code: 'LT',
    },
    {
      name: 'Luxembourg',
      code: 'LU',
    },
    {
      name: 'Macao',
      code: 'MO',
    },
    {
      name: 'Madagascar',
      code: 'MG',
    },
    {
      name: 'Malawi',
      code: 'MW',
    },
    {
      name: 'Malaysia',
      code: 'MY',
    },
    {
      name: 'Maldives',
      code: 'MV',
    },
    {
      name: 'Mali',
      code: 'ML',
    },
    {
      name: 'Malta',
      code: 'MT',
    },
    {
      name: 'Marshall Islands',
      code: 'MH',
    },
    {
      name: 'Martinique',
      code: 'MQ',
    },
    {
      name: 'Mauritania',
      code: 'MR',
    },
    {
      name: 'Mauritius',
      code: 'MU',
    },
    {
      name: 'Mayotte',
      code: 'YT',
    },
    {
      name: 'Mexico',
      code: 'MX',
    },
    {
      name: 'Micronesia (Federated States of)',
      code: 'FM',
    },
    {
      name: 'Midway Islands',
      code: 'MI',
    },
    {
      name: 'Monaco',
      code: 'MC',
    },
    {
      name: 'Mongolia',
      code: 'MN',
    },
    {
      name: 'Montenegro',
      code: 'ME',
    },
    {
      name: 'Montserrat',
      code: 'MS',
    },
    {
      name: 'Morocco',
      code: 'MA',
    },
    {
      name: 'Mozambique',
      code: 'MZ',
    },
    {
      name: 'Myanmar',
      code: 'MM',
    },
    {
      name: 'Namibia',
      code: 'NA',
    },
    {
      name: 'Nauru',
      code: 'NR',
    },
    {
      name: 'Nepal',
      code: 'NP',
    },
    {
      name: 'Netherlands',
      code: 'NL',
    },
    {
      name: 'New Caledonia',
      code: 'NC',
    },
    {
      name: 'New Zealand',
      code: 'NZ',
    },
    {
      name: 'Nicaragua',
      code: 'NI',
    },
    {
      name: 'Niger',
      code: 'NE',
    },
    {
      name: 'Nigeria',
      code: 'NG',
    },
    {
      name: 'Niue',
      code: 'NU',
    },
    {
      name: 'Norfolk Island',
      code: 'NF',
    },
    {
      name: 'Northern Mariana Islands',
      code: 'MP',
    },
    {
      name: 'Norway',
      code: 'NO',
    },
    {
      name: 'Oman',
      code: 'OM',
    },
    {
      name: 'Pakistan',
      code: 'PK',
    },
    {
      name: 'Palau',
      code: 'PW',
    },
    {
      name: 'Palestine',
      code: 'PS',
    },
    {
      name: 'Panama',
      code: 'PA',
    },
    {
      name: 'Papua New Guinea',
      code: 'PG',
    },
    {
      name: 'Paraguay',
      code: 'PY',
    },
    {
      name: 'Peru',
      code: 'PE',
    },
    {
      name: 'Philippines',
      code: 'PH',
    },
    {
      name: 'Pitcairn',
      code: 'PN',
    },
    {
      name: 'Poland',
      code: 'PL',
    },
    {
      name: 'Portugal',
      code: 'PT',
    },
    {
      name: 'Puerto Rico',
      code: 'PR',
    },
    {
      name: 'Qatar',
      code: 'QA',
    },
    {
      name: 'Republic of Korea',
      code: 'KP1',
    },
    {
      name: 'Republic of Moldova',
      code: 'MD',
    },
    {
      name: 'Réunion',
      code: 'RE',
    },
    {
      name: 'Romania',
      code: 'RO',
    },
    {
      name: 'Russian Federation',
      code: 'RU',
    },
    {
      name: 'Rwanda',
      code: 'RW',
    },
    {
      name: 'Saint Barthélemy',
      code: 'BL',
    },
    {
      name: 'Saint Helena',
      code: 'SH',
    },
    {
      name: 'Saint Kitts and Nevis',
      code: 'KN',
    },
    {
      name: 'Saint Lucia',
      code: 'LC',
    },
    {
      name: 'Saint Martin',
      code: 'MF',
    },
    {
      name: 'Saint Pierre et Miquelon',
      code: 'PM',
    },
    {
      name: 'Saint Vincent and the Grenadines',
      code: 'VC',
    },
    {
      name: 'Samoa',
      code: 'WS',
    },
    {
      name: 'San Marino',
      code: 'SM',
    },
    {
      name: 'Sao Tome and Principe',
      code: 'ST',
    },
    {
      name: 'Saudi Arabia',
      code: 'SA',
    },
    {
      name: 'Senegal',
      code: 'SN',
    },
    {
      name: 'Serbia',
      code: 'RS',
    },
    {
      name: 'Seychelles',
      code: 'SC',
    },
    {
      name: 'Sierra Leone',
      code: 'SL',
    },
    {
      name: 'Singapore',
      code: 'SG',
    },
    {
      name: 'Sint Maarten',
      code: 'SX',
    },
    {
      name: 'Slovakia',
      code: 'SK',
    },
    {
      name: 'Slovenia',
      code: 'SI',
    },
    {
      name: 'Solomon Islands',
      code: 'SB',
    },
    {
      name: 'Somalia',
      code: 'SO',
    },
    {
      name: 'South Africa',
      code: 'ZA',
    },
    {
      name: 'South Georgia and the South Sandwich Islands',
      code: 'GS',
    },
    {
      name: 'South Sudan',
      code: 'SS',
    },
    {
      name: 'Spain',
      code: 'ES',
    },
    {
      name: 'Sri Lanka',
      code: 'LK',
    },
    {
      name: 'Sudan',
      code: 'SD',
    },
    {
      name: 'Suriname',
      code: 'SR',
    },
    {
      name: 'Svalbard and Jan Mayen Islands',
      code: 'SJ',
    },
    {
      name: 'Sweden',
      code: 'SE',
    },
    {
      name: 'Switzerland',
      code: 'CH',
    },
    {
      name: 'Syrian Arab Republic',
      code: 'SY',
    },
    {
      name: 'Taiwan',
      code: 'TW',
    },
    {
      name: 'Tajikistan',
      code: 'TJ',
    },
    {
      name: 'Thailand',
      code: 'TH',
    },
    {
      name: 'The former Yugoslav Republic of Macedonia',
      code: 'MK',
    },
    {
      name: 'Timor-Leste',
      code: 'TL',
    },
    {
      name: 'Togo',
      code: 'TG',
    },
    {
      name: 'Tokelau',
      code: 'TK',
    },
    {
      name: 'Tonga',
      code: 'TO',
    },
    {
      name: 'Trinidad and Tobago',
      code: 'TT',
    },
    {
      name: 'Tunisia',
      code: 'TN',
    },
    {
      name: 'Turkey',
      code: 'TR',
    },
    {
      name: 'Turkmenistan',
      code: 'TM',
    },
    {
      name: 'Turks and Caicos Islands',
      code: 'TC',
    },
    {
      name: 'Tuvalu',
      code: 'TV',
    },
    {
      name: 'Uganda',
      code: 'UG',
    },
    {
      name: 'Ukraine',
      code: 'UA',
    },
    {
      name: 'United Arab Emirates',
      code: 'AE',
    },
    {
      name: 'United Kingdom of Great Britain & Northern Ireland',
      code: 'GB',
    },
    {
      name: 'United Republic of Tanzania',
      code: 'TZ',
    },
    {
      name: 'United States of America',
      code: 'US',
    },
    {
      name: 'United States Virgin Islands',
      code: 'VI',
    },
    {
      name: 'Uruguay',
      code: 'UY',
    },
    {
      name: 'Uzbekistan',
      code: 'UZ',
    },
    {
      name: 'Vanuatu',
      code: 'VU',
    },
    {
      name: 'Venezuela',
      code: 'VE',
    },
    {
      name: 'Viet Nam',
      code: 'VN',
    },
    {
      name: 'Wallis and Futuna',
      code: 'WF',
    },
    {
      name: 'Western Sahara',
      code: 'EH',
    },
    {
      name: 'Yemen',
      code: 'YE',
    },
    {
      name: 'Zambia',
      code: 'ZM',
    },
    {
      name: 'Zimbabwe',
      code: 'ZW',
    },
  ];
  appName = environment.appName;
  appNameSuffix = environment.appNameSuffix;
  constructor(
    private storage: StorageService,
    private networkService: NetworkService,
    public router: Router,
    private settingsService: SettingsService,
    private countryService: CountryService,
    public loading: LoadingService,
    private translate: TranslateService
  ) {
    const appLang = this.settingsService.get('applicationLanguage');
    this.translate.use(appLang.code);
  }
  ngOnInit() {
    this.getCountry();
  }
  getCountry() {
    /* Store school id and giga id inside storage */
    let countryData = {};

    this.networkService.getAccessInformation().subscribe((c) => {
      console.log(c);
      this.selectedCountry = c.country;
      this.detectedCountry = c.country;
      countryData = {
        ip_address: c.ip,
        country_code: c.country,
      };
    });
  }
  // onCountryChange(event) {
  //   this.selectedCountry = event.target.value;
  //   this.selectedCountryName = event.selectedText;
  //   console.log(this.selectedCountryName)
  // }
  onCountryChange(selectElement: HTMLSelectElement) {
    const selectedIndex = selectElement.selectedIndex;
    const selectedOption = selectElement.options[selectedIndex];
    this.selectedCountryName = selectedOption.text;

    this.selectedCountry = selectedOption.value;

    //this.settingsService.getIpcRenderer().ipcRenderer.send('select-option', this.selectedCountry);
    //(<any>window).selectOption(this.selectedCountry)
    //window.selectOption(this.selectedCountry);

    // this.settingsService.ge.ipcRenderer.send('select-option', optionValue);

    console.log(
      'selected',
      this.selectedCountry,
      this.selectedCountryName,
      'detected',
      this.detectedCountry
    );
  }
  confirmCountry() {
    //this.loading.dismiss();

    if (this.detectedCountry === undefined || this.detectedCountry === null) {
      this.detectedCountry = this.selectedCountry;
    }
    const loadingMsg =
      // eslint-disable-next-line max-len
      '<div class="loadContent"><ion-img src="assets/loader/loader.gif" class="loaderGif"></ion-img><p class="white" [translate]="\'searchCountry.check\'"></p></div>';
    this.loading.present(loadingMsg, 3000, 'pdcaLoaderClass', 'null');

    this.countryService.getPcdcCountryByCode(this.selectedCountry).subscribe(
      (response) => {
        this.pcdcCountry = response;
        console.log('pcdc country', response);
      },
      (err) => {
        console.log('ERROR: ' + err);
        this.loading.dismiss();
      },
      () => {
        this.loading.dismiss();
        if (this.pcdcCountry.length > 0) {
          this.isPcdcCountry = true;
          this.router.navigate([
            'searchschool',
            this.selectedCountry,
            this.detectedCountry,
          ]);
        } else {
          this.isPcdcCountry = false;
        }
      }
    );

    console.log(
      'selected',
      this.selectedCountry,
      'detected: ',
      this.detectedCountry
    );
    //this.router.navigate(['schoolnotfound', this.schoolId]);
    //this.router.navigate(['searchschool', this.selectedCountry, this.detectedCountry]);
  }
}
