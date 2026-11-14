# Graha sphuṭa sources — extraction notes (for future implementation)

For the three pending Settings > Calculation method options (`ss-ranganatha`, `vakya`, `ketkar`).
These are working notes written for Claude to read later. Units: r/s = rāśi (sign), ° ′ ″. KD = Kali days.
"VERIFY" marks a reading I wasn't sure of.

## Status (2026-11-14)
- **Vākyakaraṇa**: complete. Rules and all tables are done, and the constants were checked numerically.
- **Ketakī Grahagaṇita**: complete for sphuṭa: mean motions, secular (karṣa) corrections, Jupiter–Saturn inequality, Sun, ayanāṁśa and cara. Moon: the four sunrise corrections, evection, variation, equation of centre, reduction to the ecliptic, and the daily-motion tables. Planets: heliocentric manda equation, radius vectors, latitudes, and conversion to geocentric. Reproduces the book's Śaka 1815 example: mean positions to the arc-second, geocentric positions within ~2′ (Mars ~6′).
- **Sūrya Siddhānta + Raṅganātha**: plain constants confirmed. Raṅganātha's quoted bīja (Bījopanayana, commentary on ch.14 v.23) is transcribed and decoded. The mean-longitude bīja reads clearly. The epicycle bīja numbers and one divisor word are flagged VERIFY.
- **Makaranda sāriṇī** (Makaranda, Kāśī, 1478; not Raṅganātha): section E, from three published studies. Bīja mean motions and the 3-step true-planet procedure are done; the combined manda rule is verified against his Mars table. No MKS kṣepaka table seen yet.

Reading tip: the PDFs are scanned images. Render pages with PyMuPDF (pip install in a scratch venv). For tables, crop out the word column and montage 4 pages per image.

---
# A. VĀKYAKARAṆA

# VK notes (Sarma & Sastri 1962 ed.; book page = PDF page - 37)
## Ch I
- 2-3: Kali year = Saka + 3179. KaliDays to start of true solar year (Mesha sankramana) = Y*365 + Y/4 + (5Y - 1237)/576 [days, fraction gives nadi]. Day 0 (kali day 1) = Friday; weekday = KD mod 7 counting from Friday (rem 0 => Thursday?). Ex: Saka 1869 -> Y=5048 -> 1843782 + (25240-1237)/576=41.6719 d =41d 40n 19v -> 1843823-40-19.
- Month lengths (cumulative days end of month from Mesha): 31,62,94,125,156,187,217,246,276,305,335,365 (kulina... mnemonic)
- 3b-4: Dhruva = KD mod 7 ; add sankramana vakyas (days-nadi-vinadi) for Rsabha.. Mina: 2-55-32; 6-19-44; 2-56-22; 6-24-34; 2-26-44; 4-54-6; 6-48-13; 1-18-37; 2-39-30; 4-6-46; 5-55-10; 1-15-31  (these are weekday-mod-7 increments of each sankramana from previous? -> actually cumulative from Mesha mod 7: Rsabha = dhruva+2-55-32 etc.)
- 4b-5: True Sun approx = days-nadi-vinadi elapsed since Mesha sankramana read as deg-min-sec; subtract Bhupajna deduction (arcmin) for every 10 days: 
  d=10:14,20:32,30:54,40:78,50:105,60:133,70:163,80:194,90:224,100:254,110:284,120:311,130:335,140:358,150:376,160:391,170:403,180:411,190:415,200:416,210:412,220:406,230:398,240:386,250:374,260:361,270:347,280:334,290:322,300:311,310:303,320:297,330:295,340:296,350:301,360:309,370:322
- 5b daily motion = 60' -/+ (diff/10)
- 6-8 interpolation: linear a + (b-a)*x/c with signs.
- Ex: KD 1844004 -> 180d19n41v -> 180°19'41" - 6°51'08" = 173°28'33".
- 9-11 Moon: r=KD-1600984; q1=floor(r/12372), r1=r%12372; q2=floor(r1/3031), r2=r1%3031; q3=floor(r2/248), n=r2%248 = vakya index (candravakyas 'girnah sreyah...', App II pp125-34, values in rasi-deg-min).
  Dhruva = q1*(9r27°48'10") + q2*(11r7°31'1") + q3*(0r27°44'6") + 7r2°0'7". Uncorrected true Moon = Dhruva + vakya[n].
  Ex KD 1844004: r=243020, q1=19 r1=7952, q2=2 r1=1890, q3=7, n=154 -> dhruva 8r19°26'1" ; vakya154=7r21°48' -> 4r11°14'1".
- 12-14a correction: V = 32*q3 - 8*q2 vinadis (if q3==0, V = -8*q2). daily motion m (deg) = vakya[n]-vakya[n-1]; corr" = (m - 13°11')*V (deg*vinadi -> arcsec); sign accordingly. Ex: V=208, m=14°12' -> +211" -> 4r11°17'32".
- 14b-16 reduction to local true sunrise: vinadis = (30n - daylength)/2 [cara half, +ve if day shorter] + desantara + bhujantara. corr_arcsec = dailymotion(deg)*vinadis. 
  Bhujantara vinadis at end of Mesa..Mina: +16,+7,-5,-15,-21,-21,-14,-6,+4,+14,+20,+21 (interpolate).
  Desantara nadi = yojanas E-W from Ujjain meridian /55 (+ west). (Ex 24.4 yoj east -> -26.6 vinadi)
- Rahu 17-19: r=KD-1600066; r' = r - r*9/169809 (text maybe 169804); x = r' mod 6792 (days); x/566 = rasis (×30,×60 for deg min sec); Rahu = 12r - that. Ex KD1844004 -> 1r1°6'34". (mean=true)
- 19b: values are for END of kali day (i.e., start of next) at sunrise; interpolate by daily motion for time of day.
## Ch II planets
- 1-2: r = KD - sodhya[p]; reduce by mandalas (any multiples); q = floor(r / synodic cycle), d = r%cycle. True planet = TotalDhruva + vakya value for max tabulated days <= d + interpolation for rest (subtract if retro).
- 3-4: mnemonic lines for sodhya & mandalas: last 3 letters = dhruva in minutes, others = nadikas then days. (Venus 4th mandala: last 4 letters). Last vowel short => dhruva negative.
- 4: sign rule applies to correction-letter too. In sodhya tables: first line = sodhya (days-nadi + dhruva), last = cycle-days, rest = mandalas.
- 5-6a TotalDhruva = sodhyaDhruva + sum(q_i * mandalaDhruva_i) (arcmin, signed).
- 6b-9 correction letters in cycle tables: Me, Ju, Sa: last letter; Ma: last two letters (a 2-digit number); Ve: last two letters, 1st used if TotalDhruva +ve, 2nd if -ve; for Venus if letter is one of 9 starting 'ta' (ट..ध? i.e. ta-varga ṭa ṭha ḍa ḍha ṇa ta tha da dha), number halved. Correction (arcmin.. ) = TotalDhruva(deg) * corrNumber -> minutes; sign = product of signs; applied to tabulated value.
- 10-11 (iii): daily motion = (next corrected - this corrected)/interval days; retro if next less. Last mnemonic of a cycle = day 0 of next cycle. Day 0 of first cycle = apogee: Ma 118°, Me 210°, Ju 180°, Ve 90°, Sa 236°, corrected using corr-letter of last mnemonic of last cycle.
- Ex7 Mars KD1844004: sodhya 1552827-35, dh -402'; mandala 132589-21 (dh +27') x2; mandala 17158-37 (dh -504') x1; cycle 780 days -> 11 cycles, rem 259-6. TotalDhruva -852' = -14°12'. Tables 12th cycle: 250d: 3r18°18' corr -9 ; 270d: 3r28°35' corr -12. corr = -9 * -14°12'(as min) = +2°7'48" -> 3r20°25'48"; next 4r1°25'24"; dm 32'58.8"; 9d6n -> 5°0'7"; True Mars = -14°12' + 3r20°25'48" + 5°0'7" = 3r11°13'55".
- Ex8 Venus: sodhya 1561937-44 dh +17'; mandalas 174594-8 (+29'), 88756-53 (-58'), 2919-38 (-144'); cycle 584. KD1844004: 1x,1x,6x -> total -876' = -14°36'; 2 cycles, rem 29-27. 3rd cycle no mnemonic <40d: day0 = last of 2nd cycle 5r10°24' (cor 0,0); 40d: 7r0°10' (0,0). -> True Venus 6r2°26'27".
- 12: can make a new sodhya: KD - remainder after mandalas; its dhruva = total dhruva. Ex9 Mars KD 1848500: mandala 132589-21 x2 (+54), 28857-41 x1 (+133') [so Mars has mandala 28857-41 dh +133 too] -> new sodhya 1846863-58 dhruva -215'.
- 13-17: inverse problem (time of desired longitude) - year 365-15-31 days.
- Ex10 Saturn: sodhya 1589474-28 dh -326'; mandalas 182994-23 (-13'), 21551-0 (+43'); cycle 378. Saka1869 KD 1843823-40-19 -> 1x,3x -> total -210', 17 cycles, VS 275-49-19. Table: 21st cycle 378d (=22nd 0d) 4r29°44' cor +1; 22nd 30d 5r3°30' cor -1. correction = cor * TotalDhruva(min)/60 -> min. (1 x -210'/60 = -3'30")  => correction in minutes = corrNumber * TotalDhruva_deg.
- Ex11 Jupiter: Total Dhruva for Saka1873 = -14°58'; cycle 399 days (2 cycles = 798); a mandala 4387-44 dh +274'. Table 3rd cycle 30d 8r8°37' cor -2; 60d 8r14°20' cor -2.
- 18b-20 verify: at sodhya, mean planet = sighra (by Bhaskariya corrected by Vagbhava (?) corr & author's corr) and near apogee; dhruva = common mean longitude - apogee (min). Mandalas: common longitude 0/12 rasis. Ex12 Jupiter sodhya 1570425-17 dh -261': mean Sun=mean Jup=5r25°39'; 'perigee' 6r0° (i.e. Jupiter's mandocca 180°). 
- Ex13 Mercury: a mandala 2549-15 dh -447' (mean sun = mercury sighra ~ 11r22°33' = 12r-447').
- 21-25 HOW THE CYCLE MNEMONICS ARE GENERATED: for day t = (cycles gone*cycleDays + days of mnemonic), compute mean & sighra motion by Haridatta's Parahita (with Vagbhava/Sakabda correction, NOT Bhaskariya extra corr), add Apogee longitude to each -> mean, sighra. True planet by Parahita = mnemonic value. Corrector: add 1° to both mean & sighra, recompute true, subtract 1° ; difference (arcmin) = corrector (per degree of dhruva). Venus: use ±36° and divide by 36; separate corrector for +ve dhruva (add 36) and -ve dhruva (subtract 36). Sign + if kendra of penultimate op in 3r..9r, else -.
  Ex14a Mars 8th cycle 400d: t=7*780+400=5840 -> mean motion 6r10°48', mean Sun motion 0r15°38'; +apogee 3r28° -> mean 10r8°48', sighra 4r13°38' -> true 10r3°47' (table 10r3°48'). Corrector +38' hmm: 10r5°25' - 1° = 10r4°25' minus 10r3°47' = 38'. So corrector here is in arcmin per degree of dhruva? (applied: corr*Dhruva_deg minutes) -> table encodes 38? (Mars has 2 letters). ok.
  Ex14b Venus 0 day cycle1: sighra=mean=apogee 3r0° -> true 3r0°; -36° -> 1r24°41.3' -> +36 = 3r0°41.3' -> -41.3/36 = -1.1 corrector for negative dhruva.
  => The day count t is measured from the sodhya epoch; at sodhya: mean planet = mean sighra = apogee (+/- dhruva); i.e. tables assume planet mean = sighra = apogee at t=0 and Dhruva shifts everything rigidly with linear correction.
## Ch III
- 1 Precession(ayanamsa): P = (KaliYear - 3600)*(120/121)/60 deg; if >24° use 48°-P. (oscillation theory, max 24°). Ex 5048 -> 23°56'. Add precession to sun/moon/planets for cara, declination, shadow, mahapata.
- 2b-4 sine table by 15° steps, sine segments in degrees (R=60? sums 11+10.5+9+7+4+1.5 = 43? hmm sum=43; no R... ) -> actually R = 43? check next page.
- Sine: segments per 15° (R=43 units "degrees"): 11, 10.5, 9, 7, 4, 1.5 (cum 11,21.5,30.5,37.5,41.5,43). linear interp. Bhuja/koti quadrant rules standard.
- 6 latitude: sin(lat) = palabha*43/palakarna  (palakarna=sqrt(pb^2+144)).
- 7 Cara: per rasi of bhuja of SAYANA true sun: 20, 16, 6 2/3 vinadis per angula of palabha. Cara + if sayana sun 6r-12r, - if 0-6r. 8: daytime = 30 nadi - cara(vinadi) [sign reversed applied].
- 9-10 Rasimana (sayana) Lanka rising: Me 278, Ri 299, Mi 323 vinadis; local = 278-c1, 299-c2, 323-c3 for Me,Ri,Mi; 323+c3,299+c2,278+c1 for Ka,Si,Kn; 278+c1,299+c2,323+c3 Tu,Vr,Dh; 323-c3,299-c2,278-c1 Mk,Ku,Mi (c = half the cara intervals). Lagna standard: sayana sun -> rasimanas -> minus precession.
- 19-20 declination table per 5° of bhuja (arcmin): 122,242,362,478,593,704,809,907,1002,1088,1167,1237,1298,1348,1388,1416,1434,1440 (eps=24°). Sign -ve(North) for 0-6r. Moon latitude added.
- Ch IV eclipses: sun diameter = dm*5/9 minutes. (rest eclipse; not needed)
- Moon vakya 148 printed 4-26-17; katapayadi 'sampratam ravih' = 4-26-27 (used). Footnote on p.171: vakya[n] + vakya[248-n] relation: deduct serial from 248, corresponding 'sukham' 0r27°44' symmetric check.
## Intro tables (pp. xi-xii)
Table I sidereal periods (days) VK / Aryabhatiya / modern: Sun 365.258681/365.258681/365.256360; Moon 27.321679/27.3216685/27.3216604; Moon apogee 3232.62522/3231.98708/3232.58853; Node 6792.3600/6794.74951/6793.45994; Mars 686.98699/686.99974/686.97985; Mercury 87.968084/87.969880/87.969256; Jupiter 4332.7788/4332.2722/4332.5889; Venus 224.70249/224.69814/224.70080; Saturn 10764.748/10766.065/10759.227.
Table II revolutions in mahayuga (days 1,577,917,500; Sun 4,320,000): VK / Aryabhatiya / Vagbhava-corrected Ar.: Moon 57,753,315 / 57,753,336 / 57,753,314.2; Apogee 488,122.6 / 488,219 / 488,121.9; Node 232,307.7 / 232,226 / 232,307.3; Mars 2,296,866 / 2,296,824 / 2,296,862.3; Mercury 17,937,378 / 17,937,020 / 17,937,378.0; Jupiter 364,181 / 364,224 / 364,184.0; Venus 7,022,252 / 7,022,388 / 7,022,257.8; Saturn 146,582 / 146,564 / 146,581.0.
Table III Haridatta epicycles (manda odd-quadrant-end / even; sighra odd / even): Sun 13°30'/13°30'; Moon 31°30'/31°30'; Mars 81/63, 229°30'/238°30'; Mercury 22°30'/31°30', 85°30'/130°30'(as printed); Jupiter 36/31°30', 67°30'/72; Venus 9/18, 256°30'/265°30'; Saturn 58°30'/40°30', 36/40°30'.
Epoch: mean sunrise Ujjain, first day after Kali = Friday. Mean solar year 365-15-31-15 days. Sun apogee 78° fixed. Max equation of centre Sun 129' (2°9'), Moon 301'.
Table IV (cycles in mandala): Mars mean 923 / sighra 1736 / synodic 813 in 634088.99 d; Mercury 46/191/145 in 16801.899; Jupiter 225/2669/2444 in 974875.25; Venus 1199/1949/750 in 437945.158; Saturn 53/1562/1509 in 570531.65.
Table V synodic period / mean at epoch(KD0) / sighra at epoch / modern synodic: Mars 779.93745, 11r17°7', 0, 779.936102; Mercury 115.87517, 0, 3r7°8', 115.877478; Jupiter 398.88521, 0r12°51', 0, 398.884048; Venus 583.92687, 0, 4r5°22', 583.921367; Saturn 378.08757, 11r24°35', 0, 378.091902.
Mars mandalas: first 634089-9 (+4'), ..., 17158-37 (-504'), last 11699-4 (+638'); sodhya 1552827-35 (-402').
Mandocca (fixed, Aryabhata school): Ma 118, Me 210, Ju 180, Ve 90, Sa 236 (Sun 78).
Precession 59.5"/yr, zero at Kali 3600, oscillating +-24°.
Manyadi (Moon correction in almanacs) at beginnings of solar months Rsabha..: 15,10,7,8,11,17,23,28,30,29,26,21 arcmin (a bija -26' approx).
## Sodhya / mandala table (Ch II 18A-E, p.51-55) — verified: each mandala = integer synodic periods and its dhruva = mean-longitude shift
Mars: sodhya 1552827-35 dh -402; mandalas 634089-9 (+4), 132589-21 (+27), 28857-41 (+133), 17158-37 (-504), 11699-4 (+638); cycle 780 ('nahsaih')
Mercury: sodhya 1592740-22 (-32); 16801-54 (-1), 4750-53 (+149), 2549-15 (-447); cycle 116
Jupiter: sodhya 1570425-17 (-261); 974875-27 (+0) [print 4,74,875], 125648-50 (-9) [print 1,35,648; 315 syn], 65018-17 (+133), 30315-17 (-71), 21539-48 (-619), 4387-44 (+274); cycle 399
Venus: sodhya 1561937-44 (+17); 437945-9 (-0) [print 4,87,945], 174594-8 (+29), 88756-53 (-58) [print -58 nadi], 44962-23 (+2103), 2919-38 (-144); cycle 584
Saturn: sodhya 1589474-28 (-326); 570534-8 (+5), 182994-23 (-13), 21551-0 (+43), 10964-32 (+401); cycle 378
Derived (self-consistent) mean at Kali epoch: Ma 347.117 (11r17°7'), Ju 12.85 (0r12°51'), Sa 354.583 (11r24°35'), Sun 0; inner sighra: Me 249.41°, Ve 41.06° (Table V print shows 3r7°8', 4r5°22' — inconsistent with sodhyas).

---
# B. KETAKĪ GRAHAGAṆITA

# Ketaki notes (PDF page = book page + 7)
## Madhyama 1-2 (p.44-45) ahargana
Epoch: Saka 1800 (1878 CE) Caitra sukla pratipada, Wednesday, Ujjain mean sunrise. Weekday 0 = Wednesday.
vg = Saka - 1800; C = floor(vg/19) [cycles]; r = vg % 19
S (saura months) = r*12 + months elapsed since Caitra
A (adhimasa) = floor((S + 10 + C/5) / 33)
L (lunar months) = S + A
T (tithis) = L*30 + tithis elapsed in current month - floor(vg/60)?  (printed: - vargana/60)
K (ksaya) = floor(T/64); ahargana = T - K  (days within current 19-yr cycle; cycles handled via dhruvaka)
weekday: (ahargana + 3*C) mod 7, 0 = Wednesday. Fix +-1 by known weekday (Bhaskara rule).
Ex: Saka 1815 Caitra purnima Saturday: vg 15, C0, S=180, A=5, L=185, T=5564 (185*30+14), K=86, ah=5478 -> rem 4 = Sunday, so ah=5477.
Cycle: 19 yrs = 228 saura = 235 candra months; cycle ahargana taken 6940 days (true 6939.6...); lunar month 29.530587 d; sidereal year 365.2563744 d (per text p47); 64 tithis = 63 days.
## Ksepakas (madhyama 3-9, p.48-49) at Saka 1800 Caitra s.1, Ujjain mean sunrise (nirayana; planets HELIOCENTRIC mean)
Sun 11s19°05'; Moon 11s25°17'; Moon ucca (perigee? 'ucca') 10s27°22'; Rahu 9s27°37'
Mars 2s09°12'; Mercury 1s22°30'; Jupiter 9s05°40'; Venus 6s15°28'; Saturn 11s08°21'
Uccas (aphelia; Sun = apogee): Sun 2s18°41'; Mars 4s11°41'; Mercury 7s23°26'; Jupiter 5s20°13'; Venus 9s17°40'; Saturn 8s08°27'
Nodes (asc.): Mars 0s26°26'; Mercury 0s24°45'; Jupiter 2s17°04'; Venus 1s23°26'; Saturn 3s00°29'
Verse 7: ucca + (cycles * cycle-dhruva of ucca). verse 9 pata: subtract node motion (nodes retrograde?) — "pātasthitiś cakrahata-dhruveṇa vivarjitā" (cycles × dhruva subtracted).
## Dhruvakas = motion in one 6940-day cycle (mod 12 signs) (madh. 10-14)
Sun 0s0°7'38"; Moon 0s3°55'36"; Moon ucca 1s22°52'56"; Rahu 11s22°13'58"; Mars 1s6°47'20"; Mercury 10s20°49'50"; Jupiter 7s6°39'12"; Venus 10s18°47'10"; Saturn 7s22°12'37"
Ucca per cycle (arcsec, added): Sun 225, Mars 321, Mercury 117, Jupiter 126, Venus 283, Saturn 303
Pata per cycle (arcsec, subtracted — nodes regress): Mars 433, Mercury 129, Jupiter 274, Venus 363, Saturn 352
Check: Moon 6000d=79058.14974°, 900d=11858.72246°, 40d=527.05433° ; ucca 6000d 668.19792, 900d 100.22969, 40d 4.45465 (deg)
Mean = ksepaka + C*dhruvaka + ahargana*daily motion (Ujjain mean sunrise). Verse 15: all uccas & planets move forward, nodes backward.
Madh.16 Sun: deg = ah - ah/70 (deg) - ah/158 (arcmin)  [= 0.98560849 deg/day]. Ex ah 5477 -> 5398°10'45" -> 11s28°10'45" mean motion.
Exact daily mean motions stated: Sun 0.98560911 deg/d (karana rule ah*69/70 - ah/158 arcmin). Moon 13.17635823 deg/d (rule 14ah - 14ah/17 deg - ah/148 arcmin). Ex ah5477: Moon motion 5r16°54'46". Moon ucca 0.111370 deg/d (rule ah/9 deg + ah/65 arcmin). Ex 8r9°57'36".
Rahu 0.052990 deg/d retro (rule ah/19 deg + ah/46 arcmin; Rahu = ksepaka + C*dhruva - motion i.e. 12r - motion). Ex 2r9°45'9".
Mars (helio) 0.5240328 deg/d (rule 10ah/19 deg - 10ah/73 arcmin). Ex 11r20°7'37".
Mercury (helio) 4.09233871 deg/d (rule 3ah/22 signs + ah/700 deg). Ex 3r3°44'10".
Jupiter 0.0830912 deg/d (rule ah/12 deg - ah/69 arcmin). Ex 5r5°27'37"? (printed 3r5°5'27"?)
Saturn 0.0334597 deg/d (rule ah/30 deg + ah/132 arcmin). Ex 6r3°15'29"? (printed ra.6|3|15|29 => hmm 182°34'+41'29")
Venus (helio) 1.60213205 deg/d (rule 8ah/5 deg + ah/8 arcmin + ah/6 arcsec). Ex 4r14°51'50".
Saturn example via tables: ah 5477 -> 183.2586349° = 6r3°15'31" (rule gives 6r3°15'29").
Per-ghati motions (deg): Sun .016427, Moon .219606, Moon ucca .001856, Rahu .000883, Merc .068205, Mars .008734, Jup .00138?, Sat .00055?, Ven .026702.
## Karsa (secular) corrections, madh. 25-26 (p.73)
c = (Saka - 1800)/100 [centuries]; f = c^2 * 11/60? Text: "phalam vargitam sadbhir(6)-bhaktam kalādyam" -> X = c^2/6 arcmin? ; "bhavec candrakarṣo, dviguṇo 'sau (2X) ... caturghnaḥ (4X) ... svapādonitaḥ (X - X/4 =3X/4)" for Moon, ucca, Rahu in order (verify next page). Before Saka 1800: sign? 26: after 1800: + to Moon and Rahu, - to ucca; reverse before? (check)
CONFIRMED karsa (p.73-74): c=(Saka-1800)/100; X = c^2/6 arcmin = Moon karsa (+, always, before or after 1800). Moon ucca: -4X. Rahu: + (X - X/4) = +3X/4 — sign of Rahu: text 'dhanam candra-rāhvoḥ, ṛṇaṁ tuṅgasya' so Rahu longitude +3X/4 (Rahu longitude itself, which is 12r - motion). Ex Saka 2200: c=4, X=16/6=2'40" Moon +2'40", ucca -10'40", Rahu +2'0". (basis: 10.18"·c^2; ucca -37.5", Rahu +7.5")
## Jupiter-Saturn great inequality, madh. 27-29 (p.75-77)
Bhuja of kendra K: K<3s: K; 3-6s: 6s-K; 6-9s: K-6s; 9-12s: 12s-K (in degrees, 0-90).
Y = Saka - 1481; n = floor(Y/918); r = Y % 918; K = 2r * (12 signs)/153  i.e. K(signs) = 2r/153 -> "lessened by its 9th part, x20": b = bhuja deg; v = (b - b/9)*20 = b*160/9 ... wait: "bhuja-bhāga-khecara(9)-lavona-ghnā nakhā(20)" => P = (b - b/9) * 20 /... ; then Jupiter karsa (arcmin) = P/5, Saturn karsa (arcmin) = P/2.
Rule as worked: Saka 1815: Y=334, r=334, 2r=668, /153 -> K=4s11° (=4.366s -> 4s11°); bhuja = 49°; 49/9=5°27'; 49-5°27'=43°33'(printed 14°33?) hmm printed "śeṣaṁ 14|33"?; x20 -> 79°18'?? ; Jupiter = /5 = 15'51", Saturn = /2 = 39'39". Signs: kendra 0-6s (mesadi six) -> Jupiter +, Saturn - ; 6-12s -> Jupiter -, Saturn + (Saturn always opposite Jupiter).
CORRECTED J-S rule (verified from example): Y=Saka-1481; r=Y mod 918; K(signs)=2r/153; b=bhuja(K) in degrees; u=b/9; P=u*(20-u); Jupiter karsa = +P/5 arcmin, Saturn = -P/2 arcmin when K in 0-6s; signs reversed when K 6-12s. Ex Saka 1815: K=4s11°(4.366s), b=49, u=5.444, P=79.3 -> Ju +15'51", Sa -39'39".
## Sine (Sripati, p.81-83) R=100: sin(k deg) = (180-k)k*400 / (40500 - (180-k)k)   [k in deg 0..180]; inverse k = 90 - sqrt(8100 - 40500y/(400+y)) (y = R100 sine)
## Madh.30: Mean at local mean sunrise = ksepaka + C*dhruva + ahargana motion + karsa + desantara.
Desantara: Moon: yojanas from Ujjain meridian (rekha) /3 = arcmin; (- if east, + if west). Others: daily motion(arcmin) * yojanas/2500 (earth circumference 2500 yojanas)... i.e. corr = dm * yoj/2500. Moon 790'*y/2500 ≈ y/3.
Before Saka 1800: cycles C negative -> chakra-dhruva subtracted (except ucca and pata rules: uccas/patas taken fixed-ish).
WORKED EXAMPLE Saka 1815 Caitra purnima Sat, Ujjain mean sunrise, ah=5477, C=0:
 Sun 11s17°15'46" (ksepaka 11s19°5'0" + 11s28°10'46")
 Moon 5s12°12'46"; Moon ucca 7s7°19'36"; Rahu 0s7°22'19"; Mars 1s29°19'37"; Mercury 4s26°14'10"; Jupiter 0s11°11'28"; Venus 11s0°19'50"; Saturn 5s10°56'50"? (printed 5|10|56|50 ; mean before karsa)
Verified: rates reproduce example; printed Jupiter is 0s11°1'28" (=mean 0s10°45'26" + karsa 15'51"), Saturn 5s10°56'50" (=5s11°36'32" - 39'39").
# SPASTA (true) chapter (book p.91ff)
1-2: manda-kendra = mean planet - mandocca. If kendra 0-6s: phala NEGATIVE; 6-12s: POSITIVE. If kendra > 180: use 360-kendra. Table at every 10°: idx = floor(k/10); phala = T[idx] + (T[idx+1]-T[idx])*(k%10)/10 (arcmin).
Sun manda table (arcmin) k=0..180 step 10: 0,20,39,57,73,87,99,108,113,115,114,109,101,89,75,59,40,20,0   (max 115' ≈ 1°55')
Sun basis (p.98-99): e=0.01675; eq = 115.2' sin k - 1.2' sin 2k (k = mean - ucca), subtracted for k in 0-180 (i.e. true = mean - 115.2 sin k + 1.2 sin 2k), checked vs table (80->113, 100->114). Panchanga 5°-step table also given (max 1°55'17" at ~92°).
Sp.5 example: mean Sun 11s17°15'46", ucca 2s18°41' -> kendra 8s28°34'46" (>6s, so 12s - k = 3s1°25'14" = 91°25'); table at 90=115, 100=114 -> 115 - 1.25*... = 114'51"30 ; kendra in Tula-6 -> ADD -> true Sun 11s19°10'37".
Sp.6 AYANAMSA (Ketaki): v = Saka - 1800; ayanamsa = 22°8'33" + v/70 (deg) - v/50 (arcmin)  [= 50.2"/yr]. Ex Saka 1815: 0°12'51" - 0°0'18" + 22°8'33" = 22°21'6" at Mesa sankranti. (zero-ayanamsa year ≈ Saka 1800 - 22.1425*3600/50.2 ≈ Saka 212 = 290 CE (Revati/zeta Piscium type)).
Sp.7 Cara khandas (palas) = palabha*10, *8, *10/3 (palabha in angulas, equinoctial noon shadow of 12-angula gnomon). (exact: from tan latitude; obliquity 24°? Ketaki uses param kranti 23°27'? - p.111 uses tan 24... check; Ketaki karana uses 10,8,10/3)
Sp.8 Cara (palas) for sayana Sun: bhuja of sayana Sun; sum full khandas + fraction of current; applied to mean planet as (daily motion * cara palas / 3600)? text: "lavabhogya-ghātāt khāgnyā(30) [hṛt]...": cara(palas) = sum khandas + bhoga*khanda/30. Sunrise correction to planets: dm*cara/60 (palas->ghati /60). Sign: sayana Sun in Tula..Mina (6 signs): + ; Mesa..Kanya: - (for sunrise; reversed at sunset).
Ex: sayana Sun 0s11°31'43" -> cara = 11.5*30/30.. = 13 palas (negative).
Sp.9 Cara samskara (at true sunrise): cara palas = vikalas for Sun (add as computed sign); for Moon: cara*2*... "dviguṇa-navoddhṛta" = cara*2/9 arcmin? (790'/3600*cara palas -> 2c/9 arcmin). Bhujantara: Sun manda phala /16 (as arcsec? 'bhūpa(16)-hṛtaṁ dyumaṇi-phalaṁ vidhau vilomam') -> Moon correction = -SunEq/16 ... wait: Sun mandaphala(arcmin)*800/21600 = /27 for Moon; text says /16?? -> uses bhūpa=16; record: Moon bhujantara = -(Sun eq)/16? (Ketaki p113 derivation: R.M.F.*800/21600 = /27). Conflict - use /27 for Moon (math), Sun: eq*59'/21600 ≈ negligible.
 Ex: true Sun 11s19°10'37" + cara -13" -> 11s19°10'24" at true sunrise.
Sp.10 Sun daily true motion (arcmin) by manda-kendra (k from ucca, decades 0..180): 57.1,57.2,57.3,57.4,57.6,57.8,58.1,58.4,58.7,59.1,59.4,59.7,60.1,60.4,60.7,60.9,61.0,61.1,61.1 ... (mean 59.1'). 
Sp.11 Sun diameter (arcmin) = 31.5 + (dm - 57)/4 ; horizontal parallax 9".
## MOON (book p.120ff)
Order: mean Moon (Lanka/Ujjain mean sunrise) -> rekhantara (desantara) -> cara (2*cara palas/9 arcmin, same sign as Sun's) -> bhujantara: -(Sun manda-phala)/16 [the 1/16 combines the 1/27 true bhujantara with the -1/10 of Sun eq that sits inside Moon's 1st correction: -1/10+1/27 ≈ -1/16; so Moon's main correction tables already contain +1/10 of Sun eq] -> udayantara -> = mean Moon at true local sunrise; then tithi/other corrections (below) -> true Moon.
Sp.15 Udayantara for Moon (arcmin) by bhuja of SAYANA Sun, per 10°: 0,2,3,5,4,4,2,0  [bhuja 0..90 deg? 8 values for 0..70?? -> "0r 2 3 5 5 4 2 0 kala" printed list: 0,2,3,5,5,4,2,0]. Sign: sayana Sun in odd quadrant (1st,3rd) -> negative; even quadrant -> positive.
 Ex: sayana Sun 0s11°32' -> bhuja 11.5° -> 2' (neg). Corrections in example: rekhantara 0, cara -2'53", bhujantara -7'11", udayantara -2'0" -> total -12'4"; mean Moon 5s12°12'46" -> 5s11°59'42"? (printed 5|11|59|42).
Moon's 1st correction (prathama-saṁskāra) = -657" sin(Sun's manda-kendra) ≈ -(Sun eq)/10.5 — Ketaki merges this into bhujantara (see above): net Moon bhujantara = -SunEq/16.
Sp.16: 'mean Sun' for these is sayana-mean concept; day reckoned from mean sunrise.
Sp.17-18 CYUTI (evection) on mean Moon: kendra E = Moon + Moon-ucca - 2*mean Sun (Moon here = mean Moon after the 4 sunrise corrections). Correction = 74.45' sin E  (4467"); sign: E in 0-6s -> NEGATIVE; 6-12s -> POSITIVE. Table (5° steps? verse gives decades): E=0..180 step 10: 0,13,25,37,47,56,64,69,73,74,73,70,65,57,48,38,26,13,0 (arcmin). Table p.126 at 5°: 5→6.4,10→12.7,15→18.9,20→25.0,25→31.0,30→36.6,35→42.1,40→47.3,45→52.1,50→56.4,55→60.4,60→63.9,65→66.9,70→69.5,75→71.5,80→73.0,85→73.9,90→74.3,95→74.2,100→73.4,105→72.1,110→70.2,115→67.8,120→64.8,125→61.4,130→57.4,135→53.1,140→48.1,145→43.2,150→37.7,155→31.9,160→25.8,165→19.5,170→13.1,175→6.6,180→0.  (slightly asymmetric — includes a 2E term; use table).
 Ex: Moon 5s11°59'42" + ucca 7s7°19'36" - 2*Sun(11s17°15'46"x2 = 11s4°31'32"... ) -> E = 1s14°47'46" -> -51'22".
Sp.19 TITHI correction (variation): D = Moon - Sun; = +36' sin(2D)? "dhanam kham ca" ... max 36' at pada-middles; zero at amavasya/purnima. (table next page)
Commentary: Ketaki gives NO bija.
Sp.19-20 TITHI (variation): D = Moon - mean Sun (tithi-kendra). If D<=180 use table directly (signed); if D>180 use 360-D and REVERSE sign. Table arcmin D=0..180 step 10: 0,+12,+22,+30,+34,+34,+29,+21,+10,-2,-14,-25,-33,-36,-36,-32,-24,-13,0. 5° table (p.129): 5 6.1,10 11.9,15 17.4,20 22.4,25 26.6,30 30.1,35 32.5,40 33.9,45 34.3?,50 33.6,55 31.8,60 29.0,65 25.4,70 20.9,75 15.7,80 10.1,85 4.1,90 -2.1,95 -8.2,100 -14.2,105 -19.9,110 -24.8,115 -29.1,120 -32.6,125 -35.1,130 -36.6,135 -37.1,140 -36.5,145 -34.7,150 -32.0,155 -28.3,160 -23.7,165 -18.4,170 -12.6,175 -6.4,180 0. (basis +2145" sin 2D + secondary term)
 Ex: D = 5s24°43'56" -> -6'50".
Sp.21-22 MOON MANDA phala (equation of centre), applied after cyuti+tithi: kendra = Moon(after those) - Moon ucca; if >180 use 360-k. arcmin, k=0..180 step 10: 0,61,121,178,231,277,316,347,367,378,376,363,339,303,256,201,138,70,0. Sign as Sun: kendra 0-6s NEGATIVE, Tula-6 POSITIVE.
Moon manda basis: e=0.0549; eq = 377.4' sin k + 12.9' sin 2k + 0.6' sin 3k (k from perigee basis; use table with sign rule). 5° table p.136 (k: arcmin): 5 30.9,10 61.4,15 91.6,20 121.5,25 150.5,30 178.5,35 205.3,40 230.9,45 254.9,50 277.3,55 297.8,60 316.4,65 332.7,70 346.8,75 358.4,80 367.5,85 373.9,90 377.6,95 378.4,100 376.3,105 371.3,110 363.4,115 352.5,120 338.7,125 322.1,130 302.8,135 280.8,140 256.4,145 229.7,150 201.0,155 170.4,160 138.2,165 104.8,170 70.4,175 35.4,180 0.
Sp.23 Example: mean Moon at sunrise 5s11°59'42"; cyuti -51'22"; tithi -6'50" -> 5s11°1'30"; - ucca 7s7°19'36" = kendra 10s3°41'54" (>6s, 12s-k = 1s26°18'6") -> manda +5°1'34" (Tula-6 -> plus) -> true Moon in its orbit 5s16°3'4".
Sp.24 Reduction to ecliptic (parinati): u = Moon(orbit) - Rahu; table arcmin (per 10° of bhuja of u, 0..90): 0,2,4,6,7,7,6,4,2,0. Sign: u in odd quadrant (1st,3rd) NEGATIVE; even quadrant POSITIVE. Ex: Moon 5s16°3'4" - Rahu 0s7°22'19" = 5s8°40'50", bhuja 21°19' -> 4' plus -> true ecliptic Moon 5s16°7'4". (formula -6.4'*sin 2u  ~ tan^2(i/2) sin2u, i=5°9')
Moon orbital period 27.32166 d -> mean dm 790.6'.
Moon DAILY MOTION corrections (arcmin), true dm = 791' + sum of three (Sp.25-29):
 cyuti-motion by cyuti-kendra E (0..180 step10, 0-6s as printed / 6-12 continue): verse list E=0..360 step 20?: printed: ṛṇa 15,15,14,14,11,9,6,4,1; dhana 1,4,7,9,11,13,14,16,16,16 . 5° table p.140 (E: value, sign + = add): 0 -15.5,5 -15.3,10 -15.0,15 -14.6,20 -14.2,25 -13.5,30 -12.9,35 -11.8,40 -10.8,45 -9.8,50 -8.8,55 -7.4,60 -6.3,65 -5.0,70 -3.9,75 -2.6,80 -1.4,85 0.0,90 +1.4,95 +2.8,100 +4.2,105 +5.5,110 +6.7,115 +8.0,120 +9.2,125 +10.3,130 +11.4,135 +12.3,140 +13.2,145 +14.1,150 +14.7,155 +15.2,160 +15.6,165 +16.0,170 +16.3,175 +16.3,180 +16.2? (the column is defined over 0..180; for E>180 use 360-E, same value — VERIFY).
 tithi-motion by D: 5° table p.141: 0 +14.4,5 +13.7,10 +12.4,15 +10.8,20 +8.8,25 +6.5,30 +4.1,35 +1.6,40 -1.0,45 -3.5,50 -6.0,55 -8.2,60 -10.3,65 -12.0,70 -13.3,75 -14.3,80 -14.9,85 -15.0,90 -14.6,95 -13.8,100 -12.5,105 -11.0,110 -9.0,115 -6.8,120 -4.4,125 -1.9,130 +0.8,135 +3.5,140 +6.0,145 +8.5,150 +10.5,155 +12.3,160 +13.7,165 +14.9,170 +15.4,175 +15.6,180 +15.2.
 manda-motion by Moon manda-kendra k (from ucca, 0..180; if k in Tula-6 add 13° to k first, then use 360-k): 5° table p.142: 0 -80.2,5 -79.5,10 -78.1,15 -76.1,20 -73.7,25 -70.7,30 -67.3,35 -63.8,40 -59.2,45 -54.5,50 -49.2,55 -43.8,60 -37.9,65 -31.7,70 -25.0,75 -18.0,80 -10.9,85 -3.5,90 +4.0,95 +11.6,100 +19.3,105 +26.9,110 +34.5,115 +42.0,120 +49.1,125 +55.9,130 +62.6,135 +68.5,140 +74.0,145 +78.9,150 +83.1,155 +86.4,160 +89.2,165 +91.1,170 +92.2,175 +92.5,180 +91.7.
 Ex: -10 +15 -56 -> 791-51 = 740'.
Moon diameter = sqrt(dm) + sqrt(dm)/9 ... (Sp.30, eclipses; skip).
# PANCATARA (planets) chapter (book p.156ff). Planets' mean longitudes are HELIOCENTRIC.
Step 1 manda (heliocentric true): g = mean(after karsa) - ucca (aphelion); if g>180 use 360-g; phala sign: g in 0-6s NEGATIVE, 6-12s POSITIVE. Tables in 'asu' = 0.1 deg (6 arcmin), g = 0..180 step 10; interpolate:
 Mars: 0,17,33,48,63,76,87,96,103,106,107,104,98,88,75,59,41,21,0     formula 643.3' sin g + 37.5' sin2g + 3.0' sin3g
 Mercury: 0,32,65,96,125,152,178,(196),(213),... (table partly illegible)  formula 1406.2' sin g + 178.9' sin2g + 31.5' sin3g  -> USE FORMULA
 Jupiter: 0,9,18,26,34,41,46,51,54,55,55,53,49,44,37,29,20,10,0     formula 330.4' sin g + 10.0' sin2g + 0.4' sin3g
 Saturn: 0,10,21,30,39,47,54,59,63,64,64,62,58,52,45,34,24,12,0     formula 386.? (≈386.2)' sin g + 13.6' sin2g + 0.7' sin3g
 Venus: 0,1,2,3,4,5,6,7,7,8,8,8,7,7,6,5,3,2,1,0 (approx; 'sita' list)  formula 47.3' sin g + 0.2' sin2g
 (formula: + sign means add to the 'g measured from perihelion'; with g from aphelion use the table sign rule above.)
 Examples (Saka 1815 Caitra 15, mean sunrise): Mars mean 1s29°19'37", ucca 4s11°41'0" -> g 9s17°38'37" -> +9°45'54" -> helio true 2s9°5'31".
  Mercury mean 4s26°14'10", ucca 7s23°26'0" -> g 9s2°48'10" -> +22°33'50" -> 5s18°47'50" (? printed 5|18|47|50).
  Jupiter (karsa'd) 0s11°1'28", ucca 5s20°13'0" -> g 6s20°48'28" -> +2°4'22" -> 0s13°5'50".
  Venus 11s0°19'50", ucca 9s17°40'0" -> g 1s12°39'50" -> -0°31'36" -> 10s29°48'14".
  Saturn (karsa'd) 5s10°56'50", ucca 8s8°27'0" -> g 9s2°29'50" -> +6°22'30" -> 5s17°19'20".
Saturn extra small corrections (optional): (1) uses 2*Jupiter - 5*Saturn type kendra... 'gurudvighna-mandena ... 15 bhāge vihīno' : K1 = 2*Jup - Sat?(mean) - 15°; corr1 = (bhuja/32 * bhuja/5?) arcmin... Ex: corr1 -4'12", corr2 -4'19" -> total -8'31" applied to Saturn (Saturn 5s17°19'20" -> 5s17°10'49"? printed). Small; VERIFY before use.
Sp.6 mean radius vectors (manda-karna, Sun-Earth = 100): Mars 152, Mercury 39, Jupiter 520, Venus 72, Saturn 954.
Sp.7 kaksa-cyuti (a*e, AU=100): Mars 14, Mercury 8, Jupiter 25, Venus 1/2, Saturn 54; Sun 1.5 (1 1/2). Radius vector r = a - (a*e)·cos(g) with g from aphelion? -> r = a + ae*cos(g_from_aphelion) (aphelion largest).
Sp.8 radius vector: r = a + ae*cos(g + phala/2) with g = manda-kendra from APHELION (so r max at g=0). Equivalent text: kendra + half its mandaphala -> koti-jya * cyuti / R added for 'nakra-ṣaḍbha' (Makara-6, i.e. koti positive) else subtracted. Only Mars & Mercury need true r (others use mean a: Jup 520, Ven 72, Sat 954, Earth 100).
Sp.11-13 tables of true r by kendra 0..180 step 10 (kendra from ucca):
 Mars: 166,166,166,165,164,162,160,158,156,154,151,149,146,144,142,140,139,138,138
 Mercury: 47,47,46,46,45,45,44,43,42,40,39,38,37,35,33,32,32,31,31
 Ex: Mars kendra 9s17° -> 158 ; Mercury kendra 9s3° -> 41.
Sp.14-15 heliocentric latitude: beta_h(arcmin) = (Moon-latitude-type value: 309' * sin(lam_h - node)) * k/309 with k = Mars 111, Mercury 420, Jupiter 79, Venus 203, Saturn 150 (i.e. inclinations i: Ma 1°51', Me 7°0', Ju 1°19', Ve 3°23', Sa 2°30'). Node = pata (ksepaka - C*dhruva). North if (lam - node) 0-6s. Geocentric latitude = beta_h * r / rho (r = manda-karna, rho = sighra-karna).
 Ex: Mars 2s9°5' - node 0s26°26' -> beta_h 75'0" N; Mercury 245'42" N; Jupiter 70'36" S; Venus 200'55" S; Saturn 145'25" N.
Sp.42-49 GEOCENTRIC (bhūmadhya) conversion — triangle Sun–Earth–planet. Equivalent modern form (use this):
 Earth helio longitude = true Sun + 180; R = Sun's true distance (100 * (1 ± 0.0167..) ; Ketaki uses Sun mandakarna 100 ± 1.5·cos);
 x = r cos(lh) - R cos(S+180) ... i.e. geocentric λ = atan2(r sin lh + R sin S, r cos lh + R cos S) where S = true geocentric Sun (Earth at S+180).
 Text rule (outer, Ma Ju Sa): sighra-kendra K = helio true planet - true Sun; A = R·sin K... 'spar\u015b\u0101' (tangent) method: tan(phala) = R sin K / (r + R cos K); phala subtracted if K in 0-6s ('tulādau dhanam, ajādau ṛṇam' => K 6-12s add, 0-6s subtract) -> geocentric = helio - phala. Inner (Me, Ve): K = helio - true Sun; tan(phala) = r sin K / (R - ... ) (same triangle) — just use atan2.
 sighra-karna rho = sqrt(r^2 + R^2 + 2rR cos K).
Tables of sighra phala per planet follow p.171ff (not transcribed — formula is exact equivalent).
Sp.30-31 Final example (geocentric nirayana, Saka 1815 Caitra 15 Sat, Bagalkot mean sunrise), Sun used = true Sun 11s19°10'37":
 Mars 2s9°5'31" - 29°10'40" = 1s9°54'51"; Mercury 11s19°10'37" + 0°14'52" = 11s19°25'29"; Jupiter 0s13°5'50" - 3°47'7" = 0s9°18'43"; Venus 11s19°10'37" - 8°8'13" = 11s11°2'24"; Saturn 5s17°19'21" - 0°11'23"(?) = 5s17°5'58".
 Geo latitudes: Mars 58' N, Mercury 157' N, Jupiter 60' S, Venus 87' S, Saturn 162' N.
 VERIFIED: atan2(r sin lh + 100 sin S, r cos lh + 100 cos S) with r = Ma 158, Me 41, Ju 520, Ve 72, Sa 954 reproduces these within ~2' (Mars 6' — Ketaki refines Mars/Mercury via sighra-karna correction 'kaujam' rule Sp.31: phala_true = phala * rho/(rho + r_true - r_mean) for Mars; Mercury phala * r_true/r_mean). So: implement with exact vector formula using true r (manda-karna formula r = a + ae cos(g+phala/2)) and R = Sun distance (100 + 1.5 cos(Sun kendra from ucca... ) or 100).
 Sighra-karna (Sp.30): rho = 100 + mean r - tabulated 'ank' (e.g. Mars 152+100-56 = 196) — equivalent to |vector|.

---
# D. SŪRYA SIDDHĀNTA — RAṄGANĀTHA

# SURYA SIDDHANTA (Khemraj ed.: Gudhartha-prakasika of Ranganatha + Hindi tika of Baldevprasad Mishra). PDF page = book page + 10 (approx).
Plain SS constants (ch.1 v.29-44, verified in this edition; already in the app's plain 'ss' method): mahayuga revolutions Sun/Me/Ve mean 4,320,000; Moon 57,753,336; Mars 2,296,832; Mercury sighra 17,937,060; Jupiter 364,220; Venus sighra 7,022,376; Saturn 146,568; Moon apogee 488,203; Moon node 232,238 (retro); civil days 1,577,917,828. Mean positions at Kali epoch: all 0 except apogee 90°, node 180° (and kalpa-revolution mandocca/pata, ch.1 v.41-44).
## Ranganatha's bija (Bijopanayana) — quoted in his commentary on ch.14 v.23 (book p.246-247, PDF ~257-258)
Ranganatha says these verses appear at the end of the Manadhyaya in some MSS and that their placement there is incongruous (asamanjasam), so the uttara-khanda has no ganita; he still quotes the whole passage (21 verses), and it is the standard SS bija of the 16th c.
v5: the mean planet (from revolutions) and true (from epicycles) drift from observation with time, hence the bija.
v6-7 (bija base B, in DEGREES):  A = years elapsed since creation (srsti; kalpa-elapsed years to Kali start = 1,955,880,000 per SS ch.1 v.21-24 incl. 47,400 divine-yr creation deduction; + Kali years elapsed);
  r = (A * 91) mod 259,890,012   ["indu-randhra-ghno bhakto nakshatra-kakshaya"; 259,890,012 = bha-kaksha yojanas, SS 12.80]
  m = min(r, 259,890,012 - r)     ["shesham nakshatra-kakshayas tyajec, sheshakayos tayor yad alpam"]
  B = m / (259,890,012 * 15)  degrees   ["bhajed bhanam kakshaya tithi-nighnaya"; print reads 'bhajed-danank-kakshaya', taken as 'bhānāṃ kakṣayā' — VERIFY]
  -> today m/P ≈ 0.1506, so B ≈ 0.01004° ≈ 0.60'. (B changes extremely slowly under this reading — VERIFY vs. other editions/Burgess appendix.)
v7-9 bija applied to MEAN longitudes:  Sun +B ("kārayet tad dhanaṁ ravau") ; Moon −3B ("triguṇaṁ śodhayed indau"); Mars +24B ("jina-ghnaṁ bhūmije kṣipet"); Mercury sighra −22B ("dṛg-yama-ghnam ṛṇaṁ jñocce"); Jupiter −30B ("kha-rāma-ghnaṁ gurāv ṛṇam"); Venus sighra −90B ("ṛṇaṁ vyoma-nava-ghnaṁ dānavejya-calocchake"); Saturn +7B ("dhanaṁ saptāhataṁ mande" — mande = Saturn).
v10-15 manda epicycles (degrees): even-quadrant-end (yugmānta) values as in SS ch.2 are fixed; odd-quadrant-end (ojānta) values are 'nirbījaka' + bija:
  nirbijaka ojanta: Sun 14°−18'?, Moon 32°−25'? ("sūryendvor manavo dantā dhṛti-tattva-kalonitāḥ": 14 and 32, less 18' and 25' — VERIFY), Mars 65 ('bāṇa-tarkāḥ'), Mercury 27 ('acala-bāhavaḥ'), Jupiter 28 ('aṣṭa-netrāṇi'), Venus 10 ('vyoma-śītāṁśavaḥ'), Saturn 'sūrya-tarkau' (6? 12?) — VERIFY.
  bija additions to these: Sun −B/3 ('agny-uddhṛtaṁ śodhyaṁ ... bhāsvataḥ'), Moon +12B ('ina'), Mars +7B ('aśva'), Mercury +1B ('candra'), Jupiter +14B ('indra'), Venus + (bhuvā? ...)·B ('dhanaṁ bhṛgor ...'), Saturn −12B ('ravi-ghnaṁ śodhayec chaneḥ').
v16-18 sighra epicycles ojanta (nirbijaka): Mars 230 ('abhra-guṇākṣīṇi'), Mercury 134 ('abdhi-guṇendavaḥ'), Jupiter 55 ('bāṇākṣāḥ'), Venus 261 ('indu-ṣaḍ-yamāḥ'), Saturn 41 ('candrābdhayaḥ'); bija: Mars +2B, Mercury −2B, Jupiter (anya-ṣaṭ-chinnaṁ? ... ) , Venus −1B ('indughnaṁ śodhayet kaveḥ'), Saturn −1B ('candraghnam ṛṇam ārkeḥ'). "etad bījaṁ mayākhyātam" — secret, give only to tested pupils.
STATUS: bija text located and transcribed; the epicycle bija numbers and the divisor word need a second reading against another edition (Burgess, 'Bijopanayana' appendix) before implementing. The mean-longitude bija (v7-9) reading is fairly clear.
Worked example (Hindi, book p.250-255): Saka 1817 Caitra start, full plain-SS computation (ahargana 714402..., mean & true planets) — useful as a test vector for the plain SS method.

---
# C. VĀKYA TABLE DATA

Moon vākyas (n = 1..248, value = r d m; vākya[0] = 0). Index n = remainder of (KD-1600984) mod 12372 mod 3031 mod 248 — see A Ch I 9-11.
```
1:0 12 3 2:0 24 9 3:1 6 22 4:1 18 44 5:2 1 19 6:2 14 9 7:2 27 13 8:3 10 33 9:3 24 9 10:4 7 58 11:4 21 58 12:5 6 8 13:5 
20 25 14:6 4 44 15:6 19 2 16:7 3 15 17:7 17 22 18:8 1 17 19:8 15 1 20:8 28 29 21:9 11 42 22:9 24 40 23:10 7 23 24:10 19 
52 25:11 2 10 26:11 14 19 27:11 26 24 28:0 8 26 29:0 20 30 30:1 2 38 31:1 14 55 32:1 27 23 33:2 10 4 34:2 23 0 35:3 6 
12 36:3 19 39 37:4 3 21 38:4 17 15 39:5 1 20 40:5 15 33 41:5 29 51 42:6 14 10 43:6 28 27 44:7 12 37 45:7 26 39 46:8 10 
30 47:8 24 7 48:9 7 29 49:9 20 35 50:10 3 26 51:10 16 2 52:10 28 26 53:11 10 40 54:11 22 46 55:0 4 49 56:0 16 52 57:0 
28 58 58:1 11 10 59:1 23 31 60:2 6 5 61:2 18 52 62:3 1 55 63:3 15 14 64:3 28 47 65:4 12 35 66:4 26 34 67:5 10 44 68:5 
24 59 69:6 9 18 70:6 23 36 71:7 7 51 72:7 21 58 73:8 5 55 74:8 19 40 75:9 3 10 76:9 16 25 77:9 29 24 78:10 12 8 79:10 
24 39 80:11 6 58 81:11 19 8 82:0 1 13 83:0 13 15 84:0 25 19 85:1 7 27 86:1 19 43 87:2 2 10 88:2 14 49 89:2 27 43 90:3 
10 53 91:3 24 18 92:4 7 58 93:4 21 52 94:5 5 56 95:5 20 8 96:6 4 26 97:6 18 45 98:7 3 2 99:7 17 13 100:8 1 17 101:8 15 
8 102:8 28 47 103:9 12 10 104:9 25 18 105:10 8 11 106:10 20 48 107:11 3 14 108:11 15 28 109:11 27 36 110:0 9 39 111:0 
21 41 112:1 3 46 113:1 15 58 114:1 28 18 115:2 10 50 116:2 23 36 117:3 6 37 118:3 19 54 119:4 3 26 120:4 17 12 121:5 1 
11 122:5 15 19 123:5 29 34 124:6 13 52 125:6 28 10 126:7 12 25 127:7 26 33 128:8 10 32 129:8 24 18 130:9 7 50 131:9 21 
7 132:10 4 8 133:10 16 54 134:10 29 26 135:11 11 46 136:11 23 58 137:0 6 3 138:0 18 5 139:1 0 8 140:1 12 16 141:1 24 30 
142:2 6 56 143:2 19 33 144:3 2 26 145:3 15 34 146:3 28 57 147:4 12 36 148:4 26 27 149:5 10 31 150:5 24 42 151:6 8 59 
152:6 23 18 153:7 7 36 154:7 21 48 155:8 5 52 156:8 19 46 157:9 3 26 158:9 16 51 159:10 0 1 160:10 12 55 161:10 25 34 
162:11 8 1 163:11 20 17 164:0 2 25 165:0 14 29 166:0 26 31 167:1 8 36 168:1 20 46 169:2 3 5 170:2 15 36 171:2 28 20 
172:3 11 19 173:3 24 34 174:4 8 4 175:4 21 49 176:5 5 46 177:5 19 53 178:6 4 8 179:6 18 26 180:7 2 45 181:7 17 0 182:8 
1 10 183:8 15 9 184:8 28 57 185:9 12 30 186:9 25 49 187:10 8 52 188:10 21 39 189:11 4 13 190:11 16 34 191:11 28 46 
192:0 10 52 193:0 22 55 194:1 4 58 195:1 17 4 196:1 29 18 197:2 11 42 198:2 24 18 199:3 7 9 200:3 20 15 201:4 3 37 
202:4 17 14 203:5 1 5 204:5 15 7 205:5 29 17 206:6 13 34 207:6 27 53 208:7 12 11 209:7 26 24 210:8 10 29 211:8 24 23 
212:9 8 5 213:9 21 32 214:10 4 44 215:10 17 40 216:11 0 21 217:11 12 49 218:11 25 6 219:0 7 14 220:0 19 18 221:1 1 20 
222:1 13 25 223:1 25 34 224:2 7 52 225:2 20 21 226:3 3 4 227:3 16 2 228:3 29 15 229:4 12 43 230:4 26 27 231:5 10 22 
232:5 24 29 233:6 8 42 234:6 23 0 235:7 7 19 236:7 21 36 237:8 5 46 238:8 19 46 239:9 3 35 240:9 17 11 241:10 0 31 
242:10 13 35 243:10 26 25 244:11 9 0 245:11 21 22 246:0 3 35 247:0 15 41 248:0 27 44
```

### Mars mahāvākyas
Format: `days r d m corr`, one block per cycle (C1, C2...). Venus has two correctors: (+dhruva, −dhruva). A '-' row marks heliacal events or stations.
```
# Mars mahavakyas: cycle day r d m corr [note]
C1
40 4 23 35 -7
80 5 18 50 -6 udaya
120 6 14 18 -4
150 7 3 50 -1
180 7 23 54 +3
210 8 14 33 +7
230 8 28 17 +9
250 9 12 5 +11
270 9 25 18 +12
285 10 4 51 +13
300 10 13 48 +14
315 10 21 56 +15
330 10 29 7 +19
340 11 3 7 +22
350 11 6 30 +25
360 11 8 37 +28
370 11 9 55 +33 vakra
380 11 9 48 +37
390 11 8 16 +40
400 11 5 57 +41
410 11 3 18 +40
420 11 1 22 +34
430 11 0 40 +29 nivrtti
440 11 1 12 +27
450 11 3 1 +22
465 11 7 30 +16
480 11 13 6 +13
495 11 20 6 +9
510 11 27 47 +5
530 0 8 39 +3
550 0 20 0 -2
570 1 1 41 -4
600 1 19 29 -4
630 2 7 20 -7
660 2 25 35 -7
700 3 20 31 -6 astam
740 4 15 52 -7
780 5 11 35 -6
C2
40 6 7 42 -2
80 7 4 53 -0 udaya
120 8 3 35 +5
150 8 25 50 +8
180 9 18 12 +9
210 10 10 29 +9
230 10 24 58 +9
250 11 9 13 +10
270 11 23 15 +11
285 0 3 35 +12
300 0 13 7 +10
315 0 22 33 +10
330 1 0 24 +9
340 1 5 14 +8
350 1 9 25 +7
360 1 12 48 +6
370 1 15 8 +6
380 1 16 31 +4 vakra
390 1 16 6 +4
400 1 14 33 +2
410 1 11 37 +5 (ed. queries 2)
420 1 8 8 +2
430 1 4 40 +1
440 1 2 10 -1
450 1 0 51 -4
465 1 1 25 -5 nivrtti
480 1 4 27 -7
495 1 9 1 -7
510 1 14 55 -7
530 1 23 59 -9
550 2 4 16 -8
570 2 15 6 -8
600 3 2 17 -7
630 3 20 23 -7
660 4 8 52 -7
700 5 4 0 -6 astam
740 6 0 7 -4
780 6 27 40 +1
C3
40 7 26 53 +5
80 8 27 26 +8 udaya
120 9 28 20 +8
150 10 21 10 +8
180 11 13 57 +9
210 0 6 24 +9
230 0 20 52 +7
250 1 4 42 +4
270 1 17 45 +1
285 1 26 52 -1
300 2 5 18 -3
315 2 12 41 -6
330 2 19 6 -8
340 2 22 26 -11
350 2 25 11 -14
360 2 26 56 -16
370 2 27 37 -16 vakra
380 2 26 55 -21
390 2 25 12 -23
400 2 22 22 -25
410 2 18 51 -25
420 2 15 1 -22
430 2 11 58 -23
440 2 9 48 -22
450 2 9 12 -17 nivrtti
465 2 10 30 -15
480 2 14 6 -13
495 2 19 18 -12
510 2 25 42 -10
530 3 5 29 -8
550 3 16 16 -8
570 3 27 36 -6
600 4 15 11 -7
630 5 3 33 -6
660 5 22 41 -4
700 6 19 56 -0 astam
740 7 19 15 +5
780 8 20 3 +8
C4
40 9 21 22 +7
80 10 22 25 +8 udaya
120 11 23 26 +7
150 0 16 3 +5
180 1 7 42 +2
210 1 27 52 -2
230 2 10 27 -4
250 2 22 15 -6
270 3 3 11 -8
285 3 10 50 -10
300 3 17 29 -11
315 3 23 15 -14
330 3 27 35 -18
340 3 29 32 -17
350 4 0 21 -19 vakra
360 4 0 4 -20
370 3 28 31 -23
380 3 25 50 -25
390 3 22 33 -24
400 3 18 57 -26
410 3 15 47 -22
420 3 13 31 -21
430 3 12 25 -20 nivrtti
440 3 12 37 -16
450 3 14 18 -14
465 3 17 53 -13
480 3 23 12 -12
495 3 29 38 -12
510 4 6 51 -9
530 4 17 20 -8
550 4 28 34 -7
570 5 10 30 -5
600 5 29 33 -2
630 6 20 2 +2
660 7 11 48 +4
700 8 12 25 +7 astam
740 9 13 39 +7
780 10 14 49 +8
C5
40 11 16 11 +7
80 0 16 38 +4 udaya
120 1 15 18 +0
150 2 5 22 -4
180 2 24 13 -8
210 3 12 7 -8
230 3 23 30 -8
250 4 4 20 -9
270 4 14 35 -9
285 4 21 19 -10
300 4 27 8 -12
315 5 1 25 -14
330 5 3 42 -18 vakra
340 5 3 38 -21
350 5 2 21 -23
360 4 29 52 -25
370 4 26 27 -28
380 4 22 48 -28
390 4 19 38 -27
400 4 17 4 -26
410 4 15 46 -22
420 4 15 35 -18 nivrtti
430 4 16 10 -17
440 4 18 28 -14
450 4 21 21 -13
465 4 26 53 -10
480 5 3 38 -8?
495 5 11 20 -5?
510 5 19 47 -2
530 6 1 54 -1
550 6 15 0 +3
570 6 28 51 +5
600 7 20 45 +7
630 8 13 31 +8
660 9 6 33 +8
700 10 7 22 +8 astam
740 11 8 29 +7
780 0 8 56 +4
C6
40 1 7 51 -1
80 2 4 57 -3 udaya
120 3 0 32 -7
150 3 19 3 -7
180 4 7 10 -7
210 4 24 40 -8
230 5 5 40 -9
250 5 15 56 -10
270 5 25 6 -11
285 6 0 55 -12
300 6 5 33 -11
315 6 8 18 -11
330 6 8 35 -12 vakra
340 6 7 12 -12
350 6 4 22 -13
360 6 0 41 -14
370 5 26 50 -14
380 5 23 43 -13
390 5 21 51 -8
400 5 21 22 -7 nivrtti
410 5 21 59 -6
420 5 23 55 -3
430 5 26 51 -1
440 6 0 35 +1
450 6 5 0 +4
465 6 12 44 +4
480 6 21 23 +6
495 7 0 50 +7
510 7 10 53 +8
530 7 24 52 +10
550 8 9 18 +10
570 8 24 3 +9
600 9 16 16 +8
630 10 8 53 +8
660 11 1 44 +8
700 0 1 39 +4 astam
740 1 0 12 -1
780 1 27 18 -4
C7
40 2 23 22 -6
80 3 18 44 -7 udaya
120 4 13 58 -7
150 5 2 10 -7
180 5 19 56 -7
210 6 7 8 -6
230 6 18 25 -5
250 6 28 51 -3
270 7 8 44 -1
285 7 15 20 +3
300 7 21 2 +5
315 7 25 26 +10
330 7 27 46 +14
340 7 28 2 +19 vakra
350 7 27 8 +25
360 7 24 58 +30
370 7 22 1 +32
380 7 19 25 +31
390 7 17 37 +28
400 7 17 7 +28 nivrtti
410 7 18 3 +25
420 7 20 13 +23
430 7 23 35 +22
440 7 27 34 +18
450 8 2 19 +16
465 8 10 21 +15
480 8 19 9 +14
495 8 28 29 +12
510 9 8 8 +11
530 9 21 47 +11
550 10 5 52 +11
570 10 20 13 +9
600 11 11 51 +7
630 0 3 5 +3
660 0 23 38 -1
700 1 19 57 -6 astam
740 2 15 45 -6
780 3 11 13 -7
C8
40 4 6 55 -6
80 5 2 9 -7 udaya
120 5 27 25 -6
150 6 15 51 -4
180 7 4 50 -1
210 7 24 7 +3
230 8 7 5 +5
250 8 20 5 +9
270 9 2 36 +12
285 9 11 41 +14
300 9 20 10 +16
315 9 27 50 +18
330 10 4 10 +20
340 10 7 28 +24
350 10 9 43 +26
360 10 10 49 +29 vakra
370 10 10 37 +32
380 10 9 1 +35
390 10 6 28 +39
400 10 3 48 +39
410 10 1 51 +32
420 10 1 4 +28 nivrtti
430 10 1 51 +28
440 10 3 45 +25
450 10 6 43 +22
465 10 12 37 +19
480 10 19 47 +16
495 10 27 54 +13
510 11 6 31 +10
530 11 18 34 +6
550 0 3 57 +2
570 0 13 24 +1
600 1 2 4 -4
630 1 20 32 -5
660 2 9 0 -7 astam
700 3 3 51 -7
740 3 29 16 -6
780 4 24 51 -7
C9
40 5 20 26 -6
80 6 16 32 -3 udaya
120 7 13 43 +1
150 8 4 57 +5
180 8 26 46 +8
210 9 18 47 +10
230 10 3 14 +10
250 10 17 20 +10
270 11 0 57 +11
285 11 10 53 +12
300 11 20 26 +13
315 11 29 31 +15
330 0 7 43 +15
340 0 12 30 +16
350 0 16 42 +16
360 0 20 5 +17
370 0 22 26 +18
380 0 23 39 +18 vakra
390 0 23 25 +18
400 0 21 38 +20
410 0 18 51 +20
420 0 15 41 +18
430 0 13 1 +15
440 0 11 20 +13
450 0 11 0 +7 nivrtti
465 0 12 40 +4
480 0 16 23 +1
495 0 21 40 -3
510 0 27 57 -3
530 1 7 27 -6
550 1 17 51 -7
570 1 28 48 -7
600 2 15 56 -8
630 3 3 45 -7
660 3 22 13 -6
700 4 17 16 -7 astam (sign faint)
740 5 12 50 -5
780 6 9 18 -3
C10
40 7 7 9 +1
80 8 6 33 +6 udaya
120 9 7 0 +8
150 9 29 57 +8
180 10 22 31 +8
210 11 14 51 +9
230 11 29 40 +8
250 0 14 1 +8
270 0 27 43 +6
285 1 7 27 +5
300 1 16 36 +3
315 1 24 47 +1
330 2 2 2 -3
340 2 6 3 -4
350 2 9 24 -7
360 2 11 48 -9
370 2 13 11 -11
380 2 13 32 -11 vakra
390 2 12 29 -16
400 2 9 59 -17
410 2 6 39 -18
420 2 2 48 -19
430 1 29 8 -17
440 1 26 47 -18
450 1 25 35 -15 nivrtti
465 1 26 14 -14
480 1 29 17 -13
495 2 4 2 -11
510 2 10 7 -10
530 2 19 30 -9
550 2 29 59 -8
570 3 11 8 -7
600 3 28 46 -7
630 4 16 52 -7
660 5 5 33 -6
700 6 1 38 -3 astam
740 6 29 30 +1
780 7 29 16 +5
C11
40 9 0 9 +8
80 10 1 21 +7 udaya
120 11 2 12 +8
150 11 25 17 +8
180 0 17 44 +5
210 1 9 5 +2
230 1 22 25 -1
250 2 4 59 -3
270 2 16 36 -6
285 2 24 41 -7
300 3 1 56 -8
315 3 8 14 -11
330 3 13 18 -13
340 3 15 42 -16
350 3 17 23 -18
360 3 17 39 -20 vakra
370 3 16 48 -24
380 3 14 52 -26
390 3 11 59 -27
400 3 8 34 -28
410 3 4 59 -27
420 3 2 14 -25
430 2 29 56 -22
440 2 29 21 -19 nivrtti
450 3 0 1 -17
465 3 2 56 -14
480 3 7 43 -11
495 3 13 55 -10
510 3 20 59 -9
530 4 1 17 -9
550 4 12 14 -8
570 4 23 45 -7
600 5 11 58 -5
630 6 1 22 -2
660 6 22 4 +1
700 7 21 32 +6 astam
740 8 22 31 +6
780 9 23 47 +7
C12
40 10 25 4 +8
80 11 26 13 +7 udaya
120 0 26 12 +4
150 1 17 20 -1
180 2 7 8 -4
210 2 25 38 -7
230 3 7 17 -8
250 3 18 18 -9
270 3 28 35 -12
285 4 5 37 -11
300 4 11 50 -12
315 4 16 54 -13
330 4 20 7 -17
340 4 20 55 -19 vakra
350 4 20 35 -20
360 4 18 50 -26
370 4 15 55 -28
380 4 12 31 -28
390 4 8 58 -28
400 4 5 56 -25
410 4 3 50 -23
420 4 2 52 -21 nivrtti
430 4 3 1 -17
440 4 4 22 -16
450 4 6 38 -15
465 4 11 30 -12
480 4 17 40 -10
495 4 24 44 -9
510 5 2 38 -7
530 5 13 59 -5
550 5 26 13 -2
570 6 9 16 +1
600 7 0 10 +4
630 7 22 20 +7
660 8 15 12 +8
700 9 16 18 +7 astam
740 10 17 22 +8
780 11 18 35 +6
C13
40 0 18 48 +3
80 1 17 10 -4 udaya
120 2 13 42 -5
150 3 2 30 -7
180 3 20 34 -8
210 4 8 14 -7
230 4 19 31 -8
250 5 0 4 -9
270 5 9 30 -10
285 5 15 40 -12
300 5 20 27 -17
315 5 23 35 -18
330 5 24 16 -17 vakra
340 5 23 3 -19
350 5 20 42 -20
360 5 17 11 -22
370 5 13 16 -22
380 5 9 57 -21
390 5 7 26 -21
400 5 6 16 -17 nivrtti
410 5 6 17 -13
420 5 7 28 -12
430 5 9 43 -8
440 5 12 51 -7
450 5 16 42 -4
465 5 23 39 -2
480 6 1 33 +1
495 6 10 29 +3
510 6 20 2 +5
530 7 3 30 +7
550 7 17 45 +8
570 8 2 41 +9
600 8 24 56 +9
630 9 17 36 +8
660 10 10 28 +8
700 11 11 13 +7 astam
740 0 11 8 +3
780 1 9 31 -1
C14
40 2 6 31 -5
80 3 1 58 -8 udaya (ed: 58?7)
120 3 27 8 -7
150 4 15 40 -7
180 5 3 33 -8
210 5 20 39 -8
230 6 1 26 -6
250 6 11 41 -6
270 6 20 54 -4
285 6 26 53 -4
300 7 1 42 -3
315 7 4 50 +1
330 7 5 43 +5 vakra
340 7 4 47 +6
350 7 2 31 +10
360 6 29 23 +11
370 6 25 56 +11
380 6 23 13 +15
390 6 21 54 +14
400 6 21 51 +15 nivrtti
410 6 23 17 +13
420 6 25 49 +12
430 6 29 19 +12
440 7 3 43 +12
450 7 8 39 +12
465 7 17 3 +13
480 7 26 10 +12
495 8 5 50 +12
510 8 15 50 +11
530 8 29 52 +10
550 9 13 58 +9
570 9 28 43 +9
600 10 20 43 +9
630 11 12 51 +6
660 0 4 32 +4
700 1 2 18 -1 astam
740 1 28 47 -5
780 2 24 32 -7
C15
40 3 20 7 -7
80 4 15 33 -7 udaya
120 5 10 27 -7
150 5 28 43 -6
180 6 16 53 -4
210 7 5 6 -1
230 7 17 12 +1
250 7 29 3 +5
270 8 10 33 +8
285 8 18 48 +12
300 8 26 15 +16
315 9 2 54 +18
330 9 9 0 +22
340 9 10 22 +28
350 9 11 35 +32 vakra
360 9 11 32 +36
370 9 10 10 +39
380 9 7 49 +41
390 9 5 9 +41
400 9 3 11 +34
410 9 2 20 +30 nivrtti
420 9 2 58 +26
430 9 4 49 +24
440 9 7 30 +21
450 9 11 14 +19
465 9 17 58 +17
480 9 25 58 +15
495 10 4 47 +12
510 10 14 8 +12
530 10 27 10 +10
550 11 10 26 +7
570 11 23 48 +5
600 0 13 42 +1
630 1 3 7 -2
660 1 22 5 -6
700 2 17 14 -7 astam
740 3 12 29 -7
780 4 8 9 -7
# end of Mars (15 cycles). Footnote after C15 mentions 'arthesah' (570).
```

### Mercury mahāvākyas
Format: `days r d m corr`, one block per cycle (C1, C2...). Venus has two correctors: (+dhruva, −dhruva). A '-' row marks heliacal events or stations.
```
# Mercury mahavakyas: day r d m corr [note]; day-0 of cycle 1 = apogee 7r0 (210 deg)
C1
8 7 13 55 -3
16 7 27 14 -3 udaya
24 8 9 29 -2
30 8 17 31 -2
36 8 23 58 -2
40 8 27 5 -2
43 8 28 24 -2
46 8 29 0 -2 vakra
49 8 28 33 -2
50 - - - astam
52 8 26 55 -2
55 8 24 40 -2
58 8 21 47 -2
61 8 19 16 -2
64 8 17 27 -2
66 - - - udaya
67 8 16 48 -2
70 8 17 5 -1 nivrtti
73 8 18 20 -1
76 8 20 22 -1
80 8 24 5 -1
86 9 1 25 -1
92 9 10 0 -0
100 9 23 6 -0 astam
108 10 7 14 -0
116 10 21 53 +1
C2
8 11 6 43 +1
16 11 20 43 +2 udaya
24 0 3 50 +3
30 0 12 4 +3
36 0 19 40 +4
40 0 23 16 +4
43 0 25 8 +5
46 0 26 2 +6 vakra
49 0 25 56 +6
50 - - - astam
52 0 24 47 +7
55 0 22 52 +7
58 0 19 58 +8
61 0 17 19 +8
64 0 15 26 +7
66 - - - udaya
67 0 14 33 +7
70 0 14 51 +6 nivrtti
73 0 16 4 +6
76 0 18 10 +5
80 0 22 3 +4
86 0 29 33 +4
92 1 8 29 +3
100 1 21 48 +3 astam
108 2 6 5 +2
116 2 21 2 +1
C3
8 3 5 54 +1
16 3 20 3 +1 udaya
24 4 3 6 +0
30 4 11 48 +0
36 4 19 2 -0
40 4 22 46 -0
43 4 24 54 -1
46 4 25 59 -1
49 4 26 8 -1 vakra
50 - - - astam
52 4 25 18 -1
55 4 23 28 -1
58 4 20 53 -1
61 4 18 7 -1
64 4 15 57 -1
66 - - - udaya
67 4 14 27 -1
70 4 14 2 -1 nivrtti
73 4 14 43 -1
76 4 16 17 -1
80 4 19 28 -1
86 4 26 7 -1
92 5 4 12 -2
100 5 16 43 -2 astam
108 6 0 11 -3
116 6 14 17 -3
C4
8 6 28 14 -4
16 7 11 28 -4 udaya
24 7 23 30 -3
30 8 1 21 -3
36 8 7 44 -3
40 8 10 41 -3
43 8 11 48 -3
46 8 12 25 -4 vakra
49 8 11 52 -4
50 - - - astam
52 8 10 20 -4
55 8 7 53 -4
58 8 5 16 -4
61 8 2 32 -4
64 8 0 52 -4
66 - - - udaya
67 8 0 11 -3 nivrtti
70 8 0 28 -3
73 8 1 41 -3
76 8 3 45 -2
80 8 7 32 -2
86 8 14 48 -1 (print looks 8 41 48)
92 8 23 25 -1
100 9 6 24 -0 astam
108 9 20 28 -0
116 10 5 10 -0
C5
8 10 19 45 +1
16 11 3 38 +1 udaya
24 11 16 2 +1
30 11 24 48 +2
36 0 1 39 +3
40 0 4 56 +3
43 0 6 27 +4
46 0 7 11 +4 vakra
49 0 6 51 +5
50 - - - astam
52 0 5 28 +5
55 0 3 8 +6
58 0 0 23 +6
61 11 27 47 +5
64 11 26 0 +5
66 - - - udaya
67 11 25 32 +5 nivrtti
70 11 25 59 +5
73 11 27 13 +4
76 11 29 35 +4
80 0 3 41 +4
86 0 11 25 +4
92 0 20 35 +4
100 1 4 11 +4 astam
108 1 18 26 +3
116 2 3 50 +2
C6
8 2 18 52 +2
16 3 3 5 +1 udaya
24 3 16 3 +1
30 3 24 48 +1
36 4 2 0 +1
40 4 5 40 -0
43 4 7 35 -0
46 4 8 41 -0
49 4 8 48 -0 vakra
50 - - - astam
52 4 7 51 -0
55 4 5 56 -0
58 4 3 18 -0 (printed 4 33 18)
61 4 0 32 -0
64 3 28 28 -0
66 - - - udaya
67 3 27 6 -0
70 3 26 55 -0 nivrtti
73 3 27 40 -0
76 3 29 19 -0
80 4 2 42 -1
86 4 9 31 -1
92 4 17 48 -1
100 5 0 25 -1 astam
108 5 14 4 -2
116 5 28 25 -2
C7
8 6 12 41 -3
16 6 26 10 -4 udaya
24 7 7 48 -4
30 7 15 38 -4
36 7 21 50 -5
40 7 24 42 -5
43 7 25 56 -5
46 7 26 21 -5 vakra
49 7 25 42 -5
50 - - - astam
52 7 24 8 -6
55 7 21 41 -6
58 7 18 51 -6
61 7 16 20 -6
64 7 14 40 -5
66 - - - udaya
67 7 13 58 -5 nivrtti
70 7 14 14 -5
73 7 15 29 -4
76 7 17 29 -3
80 7 21 12 -3
86 7 28 25 -2
92 8 7 0 -2
100 8 19 53 -1 astam
108 9 3 52 -1
116 9 18 30 -0
C8
8 10 2 57 -0
16 10 16 41 -0 udaya
24 10 26 15 +1
30 11 7 26 +1
36 11 13 58 +2
40 11 17 2 +3
43 11 18 23 +3
46 11 18 51 +3 vakra
49 11 18 8 +3
50 - - - astam
52 11 16 31 +4
55 11 14 1 +4
58 11 11 24 +4
61 11 8 47 +4
64 11 7 23 +3
66 - - - udaya
67 11 6 58 +3 nivrtti
70 11 7 38 +3
73 11 9 11 +3
76 11 11 32 +3
80 11 15 40 +3
86 11 23 30 +3
92 0 2 41 +3
100 0 16 20 +4 astam
108 1 1 5 +4
116 1 16 22 +3
C9
8 2 1 29 +3
16 2 15 52 +2 udaya
24 2 28 58 +2
30 3 7 37 +2
36 3 14 45 +1
40 3 18 22 +1
43 3 20 12 +1
46 3 21 9 +1
49 3 21 8 +1 vakra
50 - - - astam
52 3 20 5 +1
55 3 18 4 +1
58 3 15 21 +1
61 3 12 36 +1
64 3 10 42 +1
66 - - - udaya
67 3 9 31 +1
70 3 9 28 +1 nivrtti
73 3 10 23 +1
76 3 12 12 +1
80 3 15 42 +0
86 3 22 42 +0
92 4 1 6 -0
100 4 13 54 -1 astam
108 4 27 42 -1
116 5 12 5 -1
C10
8 5 26 42 -2
16 6 9 51 -3 udaya
24 6 22 4 -3
30 6 29 59 -4
36 7 6 14 -5
40 7 9 5 -6
43 7 10 20 -6
46 7 10 40 -7 vakra
49 7 10 3 -7
50 - - - astam
52 7 8 28 -8
55 7 6 0 -8
58 7 3 7 -8
61 7 0 41 -8
64 6 28 57 -7
66 - - - udaya
67 6 28 11 -6 nivrtti
70 6 28 27 -6
73 6 29 38 -5
76 7 1 33 -5
80 7 5 13 -4
86 7 12 20 -3
92 7 20 49 -3
100 8 3 34 -2 astam
108 8 17 28 -1
116 9 1 58 -0
C11
8 9 16 18 -0
16 9 29 52 -0 udaya
24 10 12 15 -0
30 10 20 15 +1
36 10 26 34 +1
40 10 29 22 +1
43 11 0 32 +1
46 11 0 45 +2
49 10 29 54 +2
50 - - - astam
52 10 28 2 +2 vakra(label here)
55 10 25 26 +2
58 10 22 41 +2
61 10 20 24 +2
64 10 19 9 +2
66 - - - udaya
67 10 18 51 +2 nivrtti
70 10 19 40 +2
73 10 21 22 +2
76 10 23 51 +2
80 10 28 0 +2
86 11 5 56 +2
92 11 15 1 +2
100 11 28 38 +3 astam
108 0 13 23 +3
116 0 28 46 +4
C12
8 1 13 54 +4
16 1 28 21 +3 udaya
24 2 11 31 +3
30 2 20 11 +2
36 2 27 16 +2
40 3 0 45 +2
43 3 2 33 +2
46 3 3 22 +2 vakra
49 3 3 10 +2
50 - - - astam
52 3 1 52 +3
55 2 29 54 +3
58 2 27 3 +3
61 2 24 23 +3
64 2 22 26 +3
66 - - - udaya
67 2 21 35 +2 nivrtti
70 2 21 45 +2
73 2 22 53 +2
76 2 24 51 +1
80 2 28 28 +1
86 3 5 42 +1
92 3 14 19 -0
100 3 27 14 -0 astam
108 4 11 10 -0
116 4 25 46 -1
C13
8 5 10 0 -1
16 5 23 30 -2 udaya
24 6 6 7 -2
30 6 14 7 -3
36 6 20 29 -3
40 6 23 24 -5
43 6 24 42 -6
46 6 25 13 -6 vakra
49 6 24 33 -7
50 - - - astam
52 6 23 1 -7
55 6 20 32 -7
58 6 17 44 -7
61 6 15 12 -7
64 6 13 30 -6
66 - - - udaya
67 6 12 42 -6 nivrtti
70 6 12 54 -6
73 6 14 4 -5
76 6 15 57 -5
80 6 19 33 -5
86 6 26 31 -4
92 7 4 52 -4
100 7 17 30 -3 astam
108 8 1 12 -2
116 8 15 35 -1
C14
8 8 29 45 -1
16 9 13 15 -1 udaya
24 9 25 26 -0
30 10 3 15 -0
36 10 9 24 -0
40 10 11 58 -0
43 10 12 57 -0
46 10 13 0 -0 vakra
49 10 11 57 +1
50 - - - astam
52 10 10 0 +1
55 10 7 20 +1
58 10 4 34 +1
61 10 2 33 +1
64 10 1 21 +1
66 - - - udaya
67 10 1 14 +1 nivrtti
70 10 2 7 +1
73 10 3 54 +1
76 10 6 25 +1
80 10 10 41 +1
86 10 18 34 +1
92 10 27 42 +1
100 11 11 31 +2 astam
108 11 25 51 +3
116 0 11 4 +3
C15
8 0 26 10 +4
16 1 10 26 +4 udaya
24 1 23 45 +4
30 2 2 24 +3
36 2 9 25 +3
40 2 12 48 +3
43 2 14 24 +4
46 2 15 6 +4 vakra
49 2 14 48 +4
50 - - - astam
52 2 13 25 +4
55 2 11 6 +4
58 2 8 16 +4
61 2 5 44 +4
64 2 4 3 +4
66 - - - udaya
67 2 3 21 +4
70 2 3 45 +3 nivrtti
73 2 5 2 +3
76 2 7 15 +3
80 2 11 6 +2
86 2 18 32 +1
92 2 27 20 +1
100 3 10 25 +0 astam
108 3 24 30 +0
116 4 9 10 +0
C16
8 4 23 38 -1
16 5 7 22 -1 udaya
24 5 19 50 -1
30 5 27 56 -2
36 6 4 24 -3
40 6 7 20 -3
43 6 8 43 -4
46 6 9 13 -4 vakra
49 6 8 43 -4
50 - - - astam
52 6 7 8 -5
55 6 4 41 -5
58 6 1 51 -6
61 5 29 18 -5
64 5 27 37 -5
66 - - - udaya
67 5 26 51 -5 nivrtti
70 5 27 5 -4
73 5 28 17 -4
76 6 0 12 -4
80 6 3 51 -4
86 6 10 53 -4
92 6 19 11 -4
100 7 1 41 -4 astam
108 7 15 14 -3
116 7 29 27 -2
C17
8 8 13 30 -2
16 8 26 47 -1 udaya
24 9 8 47 -1
30 9 16 28 -1
36 9 22 21 -1
40 9 24 50 -1
43 9 25 40 -0 vakra
46 9 25 32 -0
49 9 24 18 -1
50 - - - astam
52 9 22 16 -1
55 9 19 29 -1
58 9 16 48 -1
61 9 14 51 -1
64 9 13 51 -0 nivrtti
66 - - - udaya
67 9 14 2 -0
70 9 14 49 -0
73 9 16 41 -0
76 9 19 14 -0
80 9 23 34 -0
86 10 1 30 -0
92 10 10 37 +1
100 10 24 7 +1 astam
108 11 8 37 +1
116 11 23 43 +1
C18
8 0 8 33 +3
16 0 22 33 +4 udaya
24 1 5 46 +4
30 1 14 20 +5
36 1 21 12 +5
40 1 24 26 +5
43 1 25 52 +5
46 1 26 22 +6 vakra
49 1 25 45 +6
50 - - - astam
52 1 24 13 +6
55 1 21 45 +7
58 1 18 54 +7
61 1 16 32 +7
64 1 15 6 +6
66 - - - udaya
67 1 14 44 +5 nivrtti
70 1 15 24 +5
73 1 16 57 +4
76 1 19 20 +4
80 1 23 25 +3
86 2 1 10 +2
92 2 10 10 +2
100 2 23 26 +1 astam
108 3 7 42 +1
116 3 22 18 +0
C19
8 4 7 0 -0
16 4 20 48 -0 udaya
24 5 3 20 -1
30 5 11 26 -1
36 5 17 55 -1
40 5 20 56 -2
43 5 22 18 -2
46 5 22 44 -3 vakra
49 5 22 10 -3
50 - - - astam
52 5 20 28 -3
55 5 18 13 -3
58 5 15 22 -3
61 5 12 50 -3
64 5 11 14 -3
66 - - - udaya
67 5 10 31 -3 nivrtti
70 5 10 52 -3
73 5 12 8 -3
76 5 14 10 -2
80 5 17 54 -3
86 5 25 0 -3
92 6 3 28 -3
100 6 16 0 -4 astam
108 6 29 30 -3
116 7 13 31 -3
C20
8 7 27 24 -3
16 8 10 30 -2 udaya
24 8 22 21 -2
30 8 29 53 -2
36 9 5 34 -2
40 9 7 53 -1
43 9 8 38 -1 vakra
46 9 8 18 -1
49 9 6 57 -1
50 - - - astam
52 9 4 50 -2
55 9 2 3 -2
58 8 29 23 -2
61 8 27 20 -2
64 8 26 31 -1 nivrtti
66 - - - udaya
67 8 26 37 -1
70 8 27 45 -1
73 8 29 45 -1
76 9 2 17 -0
80 9 6 38 -0
86 9 14 35 -0
92 9 23 44 -0
100 10 7 10 -0 astam
108 10 21 35 -0
116 11 6 31 +1
C21
8 11 21 11 +2
16 0 5 7 +2 udaya
24 0 17 50 +3
30 0 26 7 +4
36 1 2 41 +5
40 1 5 36 +6
43 1 6 52 +6
46 1 7 10 +7 vakra
49 1 6 20 +8
50 - - - astam
52 1 4 27 +8
55 1 1 52 +8
58 0 29 7 +8
61 0 27 1 +8
64 0 25 45 +7
66 - - - udaya
67 0 25 40 +6 nivrtti
70 0 26 37 +6
73 0 28 25 +5
76 1 1 3 +5
80 1 5 28 +4
86 1 13 24 +3
92 1 22 41 +3
100 2 6 17 +2 astam
108 2 20 41 +1
116 3 5 36 +1
C22
8 3 20 13 +1
16 4 4 3 +0 udaya
24 4 16 36 +0
30 4 24 45 +0
36 5 1 20 -0
40 5 4 12 -1
43 5 5 35 -1
46 5 5 55 -1 vakra
49 5 5 17 -2
50 - - - astam
52 5 3 41 -2
55 5 1 10 -2
58 4 28 18 -2
61 4 25 56 -2
64 4 24 22 -1
66 - - - udaya
67 4 23 48 -1 nivrtti
70 4 24 14 -1
73 4 25 36 -1
76 4 27 44 -1
80 5 1 33 -2
86 5 8 50 -2
92 5 17 33 -2
100 6 0 8 -3 astam
108 6 13 47 -3
116 6 27 51 -4
# end Mercury (22 cycles); closing line 'daresah' (528)
```

### Jupiter mahāvākyas
Format: `days r d m corr`, one block per cycle (C1, C2...). Venus has two correctors: (+dhruva, −dhruva). A '-' row marks heliacal events or stations.
```
# Jupiter mahavakyas: day r d m corr [note]; day-0 of cycle 1 = apogee 6r0 (180 deg); cycle 399 days
C1
15 - - - udaya
30 6 6 28 -4
60 6 12 10 -5
90 6 16 38 -5
110 6 18 41 -5
130 6 19 44 -6 vakra
150 6 19 38 -6
165 6 18 49 -6
175 6 17 48 -6
185 6 16 43 -7
195 6 15 24 -7
204 6 14 12 -7
214 6 12 56 -7
224 6 11 52 -6
234 6 11 2 -6
249 6 10 19 -6 nivrtti
269 6 10 25 -6
289 6 11 41 -5
309 6 13 49 -5
339 6 18 6 -5
369 6 24 8 -5
384 - - - astam
399 7 0 50 -4
C2
15 - - - udaya
30 7 7 14 -4
60 7 12 52 -4
90 7 17 13 -4
110 7 19 8 -4
130 7 20 2 -4 vakra
150 7 19 47 -4
165 7 18 48 -4
175 7 17 48 -5
185 7 16 33 -5
195 7 15 12 -5
204 7 14 3 -5
214 7 12 48 -5
224 7 11 48 -5
234 7 11 8 -5
249 7 10 28 -5 nivrtti
269 7 10 46 -4
289 7 12 12 -4
309 7 14 33 -4
339 7 19 25 -3
369 7 25 26 -3
384 - - - astam
399 8 2 5 -3
C3
15 - - - udaya
30 8 8 37 -2
60 8 14 20 -2
90 8 18 44 -1
110 8 20 39 -1
130 8 21 31 -1 vakra
150 8 21 11 -1
165 8 20 7 -1
175 8 19 3 -1
185 8 17 56 -1
195 8 16 25 -1
204 8 15 11 -1
214 8 13 59 -1
224 8 13 2 -1
234 8 12 22 -1
249 8 11 53 -1 nivrtti
269 8 12 21 -1
289 8 14 15 -1
309 8 16 27 -1
339 8 21 33 -0
369 8 27 52 -0
384 - - - astam
399 9 4 42 +1
C4
15 - - - udaya
30 9 11 31 +1
60 9 17 26 +2
90 9 22 3 +2
110 9 24 6 +3
130 9 25 4 +3 vakra
150 9 24 50 +3
165 9 23 48 +3
175 9 22 44 +3
185 9 21 30 +3
195 9 20 4 +3
204 9 18 50 +3
214 9 17 35 +3
224 9 16 36 +3
234 9 15 56 +3
249 9 15 28 +3 nivrtti
269 9 16 0 +3
289 9 17 40 +3
309 9 20 17 +3
339 9 25 33 +3
369 10 2 0 +3
384 - - - astam
399 10 9 10 +4
C5
15 - - - udaya
30 10 16 10 +4
60 10 22 23 +4
90 10 27 16 +5
110 10 29 29 +5
130 11 0 41 +5 vakra
150 11 0 36 +6
165 10 29 42 +6
175 10 28 45 +6
185 10 27 30 +6
195 10 26 8 +6
204 10 24 50 +6
214 10 23 34 +6
224 10 22 29 +6
234 10 21 45 +6
249 10 21 12 +6 nivrtti
269 10 21 37 +5
289 10 23 8 +5
309 10 25 45 +5
339 11 1 3 +5
369 11 7 28 +5
384 - - - astam
399 11 14 44 +5
C6
15 - - - udaya
30 11 21 52 +5
60 11 28 16 +5
90 0 3 19 +5
110 0 5 42 +5
130 0 7 6 +6
150 0 7 14 +6 vakra
165 0 6 30 +6
175 0 5 36 +6
185 0 4 27 +7
195 0 3 6 +7
204 0 1 48 +7
214 0 0 29 +7
224 11 29 22 +6
234 11 28 27 +6
249 11 27 47 +6 nivrtti
269 11 28 0 +6
289 11 29 25 +5
309 0 1 50 +5
339 0 6 59 +5
369 0 13 22 +5 (printed day looks 363)
384 - - - astam
399 0 20 30 +5
C7
15 - - - udaya
30 0 27 41 +5
60 1 4 8 +5
90 1 9 24 +5
110 1 11 51 +5
130 1 13 27 +5
150 1 13 48 +5 vakra
165 1 13 12 +6
175 1 12 25 +6
185 1 11 16 +6
195 1 10 4 +6
204 1 8 48 +6
214 1 7 25 +6
224 1 6 11 +6
234 1 5 14 +6
249 1 4 22 +6
269 1 4 21 +5 nivrtti
289 1 5 35 +5
309 1 7 50 +4
339 1 12 45 +4
369 1 19 0 +4
384 - - - astam
399 1 26 7 +3
C8
15 - - - udaya
30 2 3 3 +3
60 2 9 29 +3
90 2 14 41 +2
110 2 17 14 +2
130 2 18 51 +2
150 2 19 17 +2 vakra
165 2 18 45 +2
175 2 18 3 +2
185 2 17 2 +2
195 2 15 47 +3
204 2 14 33 +3
214 2 13 10 +3
224 2 11 55 +2
234 2 10 54 +2
249 2 9 55 +2
269 2 9 44 +2 nivrtti
289 2 10 45 +2
309 2 12 49 +1
339 2 17 21 +1
369 2 23 24 +1
384 - - - astam
399 3 0 8 +1
C9
15 - - - udaya
30 3 7 0 +0
60 3 13 11 -1
90 3 18 14 -1
110 3 20 41 -1
130 3 22 11 -1
150 3 22 35 -2 vakra
165 3 22 0 -2
175 3 21 18 -2
185 3 20 17 -2
195 3 19 12 -2
204 3 17 51 -2
214 3 16 28 -2
224 3 15 14 -2
234 3 14 11 -2
249 3 13 11 -2
269 3 12 59 -2 nivrtti
289 3 13 54 -2
309 3 15 20 -2
339 3 20 17 -2
369 3 26 2 -3
384 - - - astam
399 4 2 34 -3
C10
15 - - - udaya
30 4 9 12 -3
60 4 15 5 -3
90 4 19 56 -4
110 4 22 11 -5
130 4 23 28 -5
150 4 23 42 -5 vakra
165 4 23 4 -5
175 4 22 14 -5
185 4 21 14 -6
195 4 19 59 -6
204 4 18 41 -6
214 4 17 23 -6
224 4 16 15 -6
234 4 15 16 -5
249 4 14 21 -5
269 4 14 13 -5 (?suspect, see 289)
289 4 14 13 -5 nivrtti (as printed; smooth curve suggests ~4 15 13 — check)
309 4 17 28 -5
339 4 21 34 -4
369 4 27 18 -4
384 - - - astam
399 4 3 42 -4 (as printed; must be 5 3 42 — rasi misprint)
C11
15 - - - udaya
30 5 10 12 -5
60 5 15 59 -5
90 5 20 32 -5
110 5 22 37 -5
130 5 23 45 -6
150 5 23 48 -6 vakra
165 5 23 0 -6
175 5 22 7 -6
185 5 21 1 -7
195 5 19 43 -7
204 5 18 30 -7
214 5 17 12 -7
224 5 16 7 -7
234 5 15 13 -6
249 5 14 26 -6 nivrtti
269 5 14 28 -6
289 5 15 37 -5
309 5 17 42 -5
339 5 22 6 -5
369 5 28 3 -5
384 - - - astam
399 6 4 31 -5 (day printed 339)
# end Jupiter (11 cycles); closing 'yogindrah' (231)
```

### Venus mahāvākyas
Format: `days r d m corr`, one block per cycle (C1, C2...). Venus has two correctors: (+dhruva, −dhruva). A '-' row marks heliacal events or stations.
```
# Venus mahavakyas: day r d m corrPos corrNeg [note]; day-0 of cycle 1 = apogee 3r0 (90 deg); cycle 584 days
# corrPos used when Total Dhruva is +ve, corrNeg when -ve. (Text: a ta-varga letter halves the number -> source of the 1/2s)
C1
30 - - - - - udaya
40 4 19 0 -1 -1
80 6 8 20 -0 +0
110 7 15 5 +1/2 -0
140 8 21 35 +1 +1
160 9 15 54 +1 +1
180 10 9 49 +1 +2
195 10 27 12 -0 +2
210 11 13 44 -0 +1
220 11 24 17 +0 +2
230 0 4 6 -0 +1/2
238 0 11 36 +0 +0
246 0 17 56 -0 +0
252 0 22 22 -0 -0
258 0 26 0 -0 -0
264 0 28 44 +0 -0
270 1 0 18 -1 -0
276 1 0 30 -1 -0 vakra
282 0 28 58 -1 +0
287 - - - - - astam
288 0 25 48 -1 -0
296 0 20 13 -1.5 -0
297 - - - - - udaya
302 0 16 21 -1.5 -0
308 0 13 37 -1.5 -0
314 0 12 31 -2 -0 nivrtti
320 0 13 0 -1.5 -0
326 0 14 51 -1.5 -0
332 0 17 42 -2 +0
338 0 21 29 -2 -0
346 0 27 31 -2 -1/2
354 1 4 8 -2 -1/2
364 1 13 35 -2.5 -1
374 1 23 35 -2 -1
389 2 9 19 -1.5 -2
404 2 25 51 -1 -2
424 3 18 45 +0 -1
444 4 12 30 -0 -1/2
474 5 18 46 +0 +0
504 6 25 33 +1 -0
544 8 15 33 +1/2 +1
554 - - - - - astam
584 10 6 17 -0 +1
C2
30 - - - - - udaya
40 11 26 14 -0 -0
80 1 15 40 -1/2 -0
110 2 22 5 -1 -1/2
140 3 27 31 -1 -1.5
160 4 20 49 +0 -1.5
180 5 13 51 -0 -1
195 6 0 44 -0 -0
210 6 16 53 -0 -0
220 6 27 5 -0 -0
230 7 6 40 +0 +0
238 7 13 26 +1 -0
246 7 19 34 +1 -0
252 7 23 24 +1.5 -0
258 7 26 20 +2 +0
264 7 28 15 +3 +0
270 7 28 55 +4 +1 vakra
276 7 27 56 +5 +1
282 7 25 16 +6.5 +1
287 - - - - - astam
288 7 21 23 +7.5 +1.5
296 7 15 51 +7.5 +1
297 - - - - - udaya
302 7 12 54 +6.5 +1
308 7 11 26 +7 +1
314 7 11 43 +5.5 +1.5
320 7 11 19 +5 +1 nivrtti
326 7 16 9 +5 +2
332 7 19 54 +4 +2
338 7 24 24 +3 +2
346 8 1 5 +3 +2
354 8 8 38 +2 +2
364 8 18 45 +1 +2.5
374 8 29 22 +1 +2
389 9 15 57 +0 +2
404 10 2 58 -0 +1
424 10 26 12 +0 +0
444 11 19 56 -0 -0
474 0 26 7 -1 -1/2
504 2 2 27 -1.5 -1
544 3 20 53 -1/2 -1
554 - - - - - astam
584 5 10 24 -0 +0
C3
30 - - - - - udaya
40 7 0 10 +0 +0
80 8 19 56 +1.5 +1/2
110 9 27 30 +1 +1.5
140 11 4 20 -0 +1
160 11 28 12 -0 +1/2
180 0 21 34 -0 -0
195 1 8 38 -0 -0
210 1 24 58 -1 -0
220 2 5 26 -1 -0
230 2 15 6 -2 -0
238 2 22 18 -3 -1
246 2 28 24 -3 -1
252 3 2 30 -4 -1.5
258 3 5 36 -4.5 -2
264 3 7 47 -5 -3
270 3 8 40 -6 -3 vakra
276 3 7 57 -7 -5
282 3 5 32 -7.5 -6.5
287 - - - - - astam
288 3 1 45 -8 -7.5
296 2 25 54 -8 -7
297 - - - - - udaya
302 2 22 20 -7 -7
308 2 19 58 -5.5 -6
314 2 19 17 -4 -5.5 nivrtti
320 2 20 8 -3 -5
326 2 22 16 -3 -4.5
332 2 25 29 -2 -4
338 2 29 33 -1 -4
346 3 5 36 -1 -3
354 3 12 54 -1 -2
364 3 22 32 -0 -1.5
374 4 3 9 -0 -1
389 4 19 24 -0 -0
404 5 6 30 +0 +0
424 5 29 53 +1/2 +0
444 6 23 44 +1 -0
474 8 0 31 +1.5 +1
504 9 8 3 +1 +1.5
544 10 27 56 -0 +1/2 (day printed 545)
554 - - - - - astam
584 0 17 40 -0 +0
C4
30 - - - - - udaya
40 2 7 14 -1 -0
80 3 25 37 -1 -1.5
110 5 1 58 -0 -1
140 6 8 8 -0 -0
160 7 1 52 +0 +0
180 7 25 7 +1/2 -0
195 8 12 6 +1.5 -0
210 8 28 35 +2 +1
220 9 9 10 +3 +1
230 9 19 12 +2 +2
238 9 26 44 +2 +3
246 10 3 24 +2 +3
252 10 7 54 +2 +4
258 10 11 35 +2 +4.5
264 10 14 18 +1.5 +5
270 10 15 55 +1? +6 vakra (first corrector illegible)
276 10 15 2 +1.5 +7
282 10 14 25 +2 +7.5
287 - - - - - astam
288 10 11 17 +2 +8
296 10 5 42 +1.5 +8
297 - - - - - udaya
302 10 2 2 +1 +7
308 9 29 33 +1 +5.5
314 9 28 41 +2 +4.5 nivrtti
320 9 29 26 +1.5 +3
326 10 1 25 -0 +2
332 10 4 24 -0 +2
338 10 8 14 +0 +1
346 10 14 30 +0 +1
354 10 21 16 -0 +0
364 11 0 54 -0 +0
374 11 11 8 +0 -0
389 11 27 20 -0 +0
404 0 14 12 -1 -0
424 1 7 18 -1.5 -0
444 2 0 38 -1.5 -1
474 3 6 0 +1 -1.5
504 4 12 25 +0 -1
544 6 1 50 +0 +0
554 - - - - - astam
584 7 21 45 -1 +0
C5
30 - - - - - udaya
40 9 12 25 +0 +1
80 11 2 30 -0 +0
110 0 9 14 -0 -0
140 1 15 31 -1/2 -0
160 2 9 18 -2 -0
180 3 2 17 -2 -1
195 3 18 50 -2 -1.5
210 4 4 30 -1 -2
220 4 14 27 -1 -2.5
230 4 23 48 -1/2 -2
238 5 0 25 -1/2 -2
246 5 6 24 +0 -2
252 5 10 8 +0 -2 (day printed 222)
258 5 12 59 -0 -2
264 5 14 45 +0 -1.5
270 5 15 8 +0 -2 vakra
276 5 13 58 +0 -2
282 5 11 5 +0 -2
287 - - - - - astam
288 5 7 4 +0 -2
296 5 1 27 -0 -1.5
297 - - - - - udaya
302 4 28 32 -0 -0
308 4 27 7 -0 -1 nivrtti
314 4 27 20 -0 -1/2
320 4 29 1 -0 -1/2
326 5 1 45 0 +0
332 5 5 30 +0 +0
338 5 9 59 +0 +0
346 5 16 18 +0 -0
354 5 23 50 -1/2 -0
364 6 3 43 -1 -0
374 6 14 17 -1 -0
389 7 0 48 -1.5 -0
404 7 18 12 -2 +1
424 8 12 4 -1 +1.5
444 9 6 26 -1 +1.5
474 10 13 0 -0 +1
504 11 19 44 -0 -0
544 1 9 6 +1 +0
554 - - - - - astam
584 2 28 8 +1 -1
# end Venus (5 cycles); closing 'madhukah' (195)
```

### Saturn mahāvākyas
Format: `days r d m corr`, one block per cycle (C1, C2...). Venus has two correctors: (+dhruva, −dhruva). A '-' row marks heliacal events or stations.
```
# Saturn mahavakyas: day r d m corr [note]; day-0 of cycle 1 = apogee 7r26 (236 deg); cycle 378 days
C1
15 - - - udaya
30 7 29 26 -6
60 8 2 10 -7
85 8 3 47 -7
110 8 4 38 -8
130 8 4 40 -8 vakra
150 8 4 7 -8
165 8 3 28 -8
175 8 2 40 -8
185 8 1 52 -8
193 8 1 13 -8
203 8 0 28 -8
213 7 29 48 -8
228 7 29 2 -8
248 7 28 22 -8 nivrtti
268 7 28 38 -7
293 7 29 30 -7
318 8 1 7 -7
348 8 3 55 -7
363 - - - astam
378 8 7 20 -7
C2
15 - - - udaya
30 8 10 43 -7
60 8 13 22 -8
85 8 14 54 -8
110 8 15 40 -8
130 8 15 40 -9 vakra
150 8 15 8 -9
165 8 14 14 -9
175 8 13 35 -9
185 8 12 48 -9
193 8 12 9 -9
203 8 11 23 -9
213 8 10 47 -9
228 8 10 0 -9
248 8 9 35 -8 nivrtti
268 8 9 43 -8
293 8 10 38 -8
318 8 12 20 -8
348 8 15 6 -8
363 - - - astam
378 8 18 31 -8
C3
15 - - - udaya
30 8 21 50 -8
60 8 24 29 -8
85 8 25 56 -9
110 8 26 40 -9 vakra
130 8 26 37 -9
150 8 26 3 -9
165 8 25 7 -9
175 8 24 26 -9
185 8 23 37 -9
193 8 22 59 -9
203 8 22 14 -9
213 8 21 38 -9
228 8 20 56 -9
248 8 20 33 -9 nivrtti
268 8 20 48 -8
293 8 21 41 -8
318 8 23 23 -8
348 8 26 12 -8
363 - - - astam
378 8 29 40 -7
C4
15 - - - udaya
30 9 2 57 -8
60 9 5 33 -8
85 9 7 0 -8
110 9 7 40 -8 vakra
130 9 7 32 -8
150 9 6 51 -9
165 9 5 58 -9
175 9 5 15 -9
185 9 4 27 -9
193 9 3 48 -9
203 9 3 4 -9
213 9 2 28 -9
228 9 1 51 -9
248 9 1 26 -9 nivrtti
268 9 1 41 -8
293 9 2 44 -8
318 9 4 26 -8
348 9 7 21 -7
363 - - - astam
378 9 10 52 -7
C5
15 - - - udaya
30 9 14 8 -7
60 9 16 43 -7
85 9 18 8 -7
110 9 18 46 -7 vakra
130 9 18 38 -7
150 9 17 53 -8
165 9 16 58 -8
175 9 16 14 -8
185 9 15 25 -8
193 9 14 47 -8
203 9 14 5 -8
213 9 13 28 -8
228 9 12 51 -8
248 9 12 33 -7 nivrtti
268 9 12 51 -7
293 9 13 56 -7
318 9 15 44 -6
348 9 18 48 -6
363 - - - astam
378 9 22 14 -6
C6
15 - - - udaya
30 9 25 35 -5
60 9 28 8 -5
85 9 29 33 -5
110 9 29 59 -5
130 10 0 0 -5 vakra
150 9 29 13 -5
165 9 28 16 -5
175 9 27 30 -5
185 9 26 40 -5
193 9 26 2 -6
203 9 25 20 -6
213 9 24 45 -6
228 9 24 9 -6
248 9 23 53 -6 nivrtti
268 9 24 12 -5
293 9 25 22 -4
318 9 27 16 -4
348 10 0 20 -4
363 - - - astam
378 10 3 57 -4
C7
15 - - - udaya
30 10 7 18 -4
60 10 9 56 -3
85 10 11 25 -3
110 10 11 57 -3 vakra
130 10 11 48 -3
150 10 11 1 -3
165 10 9 58 -3
175 10 9 16 -3
185 10 8 22 -3
193 10 7 47 -3
203 10 6 58 -3
213 10 6 29 -3
228 10 5 52 -3
248 10 5 40 -3 nivrtti
268 10 6 3 -3
293 10 7 25 -3
318 10 9 12 -3
348 10 12 21 -2
363 - - - astam
378 10 16 4 -2
C8
15 - - - udaya
30 10 19 32 -1
60 10 22 13 -1
85 10 23 42 +1
110 10 24 20 +1 vakra
130 10 24 11 +1
150 10 23 22 +1
165 10 22 22 +1
175 10 21 35 +1
185 10 20 43 +1
193 10 20 5 +1
203 10 19 22 +1
213 10 18 44 +1
228 10 18 11 +1
248 10 17 58 +1 nivrtti
268 10 18 22 +1
293 10 19 40 +1
318 10 21 38 +1
348 10 24 56 +1
363 - - - astam
378 10 28 44 +1
C9
15 - - - udaya
30 11 2 17 +2
60 11 5 3 +3
85 11 6 36 +3
110 11 7 18 +3 vakra
130 11 7 10 +3
150 11 6 24 +3
165 11 5 25 +3
175 11 4 35 +3
185 11 3 43 +3
193 11 3 2 +3
203 11 2 21 +3
213 11 1 45 +3
228 11 1 8 +3
248 11 0 55 +3 nivrtti
268 11 1 22 +3
293 11 2 37 +3
318 11 4 41 +4
348 11 8 1 +4
363 - - - astam
378 11 11 55 +7 (as printed)
C10
15 - - - udaya
30 11 15 37 +4
60 11 18 28 +4
85 11 20 7 +6
110 11 20 52 +6 vakra
130 11 20 49 +6
150 11 20 3 +6
165 11 19 14 +6
175 11 18 17 +6
185 11 17 25 +6
193 11 16 44 +6
203 11 16 0 +6
213 11 15 21 +6
228 11 14 44 +6
248 11 14 28 +6 nivrtti
268 11 14 52 +6
293 11 16 12 +6
318 11 18 16 +6
348 11 21 35 +6 (rasi printed 10)
363 - - - astam
378 11 25 39 +6
C11
15 - - - udaya
30 11 29 26 +6
60 0 2 26 +7
85 0 4 8 +7
110 0 5 1 +7 vakra
130 0 5 0 +7
150 0 4 14 +8
165 0 3 20 +8
175 0 2 31 +8
185 0 1 41 +8
193 0 0 59 +8
203 0 0 12 +8
213 11 29 27 +8
228 11 28 53 +8
248 11 28 36 +7 nivrtti
268 11 28 59 +7
293 0 0 16 +7
318 0 2 21 +7
348 0 5 43 +7
363 - - - astam
378 0 9 43 +7
C12
15 - - - udaya
30 0 13 36 +7
60 0 16 43 +8
85 0 18 30 +8
110 0 19 34 +8 vakra
130 0 19 29 +8
150 0 18 52 +9
165 0 17 56 +9
175 0 17 10 +9
185 0 16 18 +9
193 0 15 36 +9
203 0 14 52 +9
213 0 14 13 +9
228 0 13 26 +9
248 0 13 5 +9 nivrtti
268 0 13 22 +8
293 0 14 37 +8
318 0 16 45 +8
348 0 19 45 +8
363 - - - astam
378 0 24 4 +8
C13
15 - - - udaya
30 0 27 57 +8
60 1 1 8 +8
85 1 3 8 +8
110 1 4 4 +8
130 1 4 9 +9 vakra
150 1 3 35 +9
165 1 2 45 +9
175 1 1 59 +9
185 1 1 7 +9
193 1 0 24 +9
203 0 29 35 +9
213 0 28 53 +9
228 0 28 6 +9
248 0 27 42 +9 nivrtti
268 0 27 57 +8
293 0 29 7 +8
318 1 1 5 +8
348 1 4 23 +7
363 - - - astam
378 1 8 21 +7
C14
15 - - - udaya
30 1 12 17 +7
60 1 15 31 +7
85 1 17 26 +6
110 1 18 30 +7
130 1 18 41 +8 vakra (printed 'nivrtti')
150 1 18 12 +8
165 1 17 22 +8
175 1 16 40 +8
185 1 15 52 +8
193 1 15 8 +8
203 1 14 17 +8
213 1 13 33 +8
228 1 12 55 +8
248 1 12 15 +8
268 1 12 25 +7
293 1 13 28 +7
318 1 15 24 +7
348 1 18 37 +7
363 - - - astam
378 1 22 31 +7
C15
15 - - - udaya
30 1 26 28 +6
60 1 29 45 +7 (rasi printed 2)
85 2 1 48 +7
110 2 2 51 +7
130 2 3 0 +7 vakra
150 2 2 33 +8
165 2 1 48 +8
175 2 1 6 +8
185 2 0 17 +8
193 1 29 35 +8
203 1 28 43 +8
213 1 27 58 +8
228 1 27 6 +8
248 1 26 33 +7 nivrtti
268 1 26 42 +7
293 1 27 41 +7
318 1 29 35 +7
348 2 2 41 +7
363 - - - astam
378 2 6 36 +7
C16
15 - - - udaya
30 2 10 36 +7
60 2 13 56 +7
85 2 15 58 +8
110 2 17 10 +8
130 2 17 26 +8 vakra
150 2 17 5 +9
165 2 16 20 +9
175 2 15 40 +9
185 2 14 51 +9
193 2 14 10 +9
203 2 13 18 +9
213 2 12 25 +9
228 2 11 37 +9
248 2 11 0 +9 nivrtti
268 2 11 5 +8
293 2 12 2 +8
318 2 13 52 +8
348 2 16 58 +8
363 - - - astam
378 2 20 52 +8
C17
15 - - - udaya
30 2 24 52 +8
60 2 28 18 +8
85 3 0 24 +8
110 3 1 40 +8
130 3 2 2 +9 vakra
150 3 1 44 +9
165 3 1 6 +9
175 3 0 24 +9
185 2 29 40 +9
193 2 28 56 +9
203 2 28 3 +9
213 2 27 15 +9
228 2 26 17 +9
248 2 25 38 +9
268 2 25 37 +9 nivrtti
293 2 26 32 +8
318 2 28 17 +8
348 3 1 20 +8
363 - - - astam
378 3 5 12 +7
C18
15 - - - udaya
30 3 9 16 +8
60 3 12 44 +8
85 3 14 50 +8
110 3 16 12 +8
130 3 16 26 +8 vakra
150 3 16 22 +9
165 3 15 43 +9
175 3 15 7 +9
185 3 14 22 +9
193 3 13 41 +9
203 3 12 48 +9
213 3 11 59 +9
228 3 11 0 +9
248 3 10 14 +8
268 3 10 7 +8 nivrtti
293 3 10 59 +8
318 3 12 41 +7
348 3 15 38 +7
363 - - - astam
378 3 19 25 +6
C19
15 - - - udaya
30 3 23 27 +6
60 3 26 54 +6
85 3 29 2 +6
110 4 0 27 +6
130 4 0 54 +7 vakra
150 4 0 45 +7
165 4 0 10 +7
175 3 29 32 +7
185 3 28 49 +7
193 3 28 10 +7
203 3 27 17 +7
213 3 26 26 +7
228 3 25 25 +7
248 3 24 37 +7
268 3 24 27 +7 nivrtti
293 3 25 12 +6
318 3 26 50 +6
348 3 29 39 +5
363 - - - astam
378 4 3 20 +5
C20
15 - - - udaya
30 4 7 17 +4
60 4 10 44 +4
85 4 12 53 +4
110 4 14 17 +4
130 4 14 45 +4 vakra
150 4 14 36 +4
165 4 14 4 +4
175 4 13 28 +4
185 4 12 46 +4
193 4 12 8 +4
203 4 11 13 +4
213 4 10 26 +4
228 4 9 23 +4
248 4 8 32 +4
268 4 8 21 +4 nivrtti
293 4 8 59 +4
318 4 10 30 +4
348 4 13 15 +4
363 - - - astam
378 4 16 47 +3
C21
15 - - - udaya
30 4 20 52 +2
60 4 24 1 +2
85 4 26 8 +2
110 4 27 31 +2
130 4 27 51 +2
150 4 27 53 +2 vakra
165 4 27 22 +2
175 4 26 45 +2
185 4 26 7 +2
193 4 25 30 +2
203 4 24 37 +2
213 4 23 47 +2
228 4 22 44 +2
248 4 21 51 +2
268 4 21 35 +2 nivrtti
293 4 22 12 +2
318 4 23 37 +1 (rasi printed 6)
348 4 26 16 +1
363 - - - astam
378 4 29 24 +1
C22
15 - - - udaya
30 5 3 30 -1
60 5 6 45 -1
85 5 8 48 -2
110 5 10 7 -2
130 5 10 35 -2 vakra
150 5 10 26 -2
165 5 9 56 -2
175 5 9 20 -2
185 5 8 42 -2
193 5 8 5 -2
203 5 7 14 -2
213 5 6 26 -2
228 5 5 23 -2
248 5 4 30 -2
268 5 4 16 -2 nivrtti
293 5 4 45 -2
318 5 6 10 -2
348 5 8 44 -2
363 - - - astam
378 5 12 5 -2
C23
15 - - - udaya
30 5 15 46 -2
60 5 18 56 -4
85 5 20 56 -4
110 5 22 12 -4
130 5 22 36 -4 vakra
150 5 22 26 -4
165 5 21 50 -4
175 5 21 20 -4
185 5 20 40 -4
193 5 20 4 -4
203 5 19 14 -4
213 5 18 26 -4
228 5 17 25 -4
248 5 16 33 -4
268 5 16 18 -4 nivrtti
293 5 16 50 -4
318 5 18 12 -4
348 5 20 42 -4
363 - - - astam
378 5 24 0 -4
C24
15 - - - udaya
30 5 27 37 -5
60 6 0 40 -5
85 6 2 34 -6
110 6 3 56 -6
130 6 4 9 -7 vakra
150 6 3 57 -7
165 6 3 22 -7
175 6 2 50 -7
185 6 2 8 -7
193 6 1 31 -7
203 6 0 42 -7
213 5 29 53 -7
228 5 28 57 -7
248 5 28 17 -7
268 5 27 54 -7 nivrtti
293 5 28 25 -6
318 5 29 45 -6
348 6 2 15 -6
363 - - - astam
378 6 5 32 -6
C25
15 - - - udaya
30 6 9 2 -6
60 6 12 0 -7
85 6 13 52 -7
110 6 15 1 -8
130 6 15 20 -8 vakra
150 6 15 9 -8
165 6 14 29 -8
175 6 13 56 -8
185 6 13 16 -8
193 6 12 38 -8
203 6 11 48 -8
213 6 11 0 -8
228 6 10 6 -8
248 6 9 19 -8
268 6 9 10 -8 nivrtti
293 6 9 32 -7
318 6 11 2 -7
348 6 13 33 -7
363 - - - astam
378 6 16 48 -7
C26
15 - - - udaya
30 6 20 17 -8
60 6 23 12 -8
85 6 24 59 -8
110 6 26 5 -8
130 6 26 20 -9 vakra
150 6 26 2 -9
165 6 25 21 -9
175 6 24 50 -9
185 6 24 8 -9
193 6 23 30 -9
203 6 22 38 -9
213 6 21 56 -9
228 6 21 3 -9
248 6 20 20 -9
268 6 20 10 -8 nivrtti
293 6 20 47 -8
318 6 22 8 -8
348 6 24 42 -8
363 - - - astam
378 6 27 57 -8
C27
15 - - - udaya
30 7 1 15 -8
60 7 4 17 -8
85 7 6 1 -8
110 7 7 2 -8
130 7 7 15 -9 vakra
150 7 6 56 -9
165 7 6 15 -9
175 7 5 38 -9
185 7 4 56 -9
193 7 4 18 -9
203 7 3 30 -9
213 7 2 47 -9
228 7 1 53 -9
248 7 1 11 -9
268 7 1 5 -8 nivrtti
293 7 1 44 -8
318 7 3 13 -8
348 7 5 47 -8
363 - - - astam
378 7 9 5 -7
C28
15 - - - udaya
30 7 12 27 -7
60 7 15 23 -8
85 7 17 5 -8
110 7 18 5 -8
130 7 18 17 -8 vakra
150 7 17 51 -8
165 7 17 11 -9
175 7 16 32 -9
185 7 15 49 -9
193 7 15 10 -9
203 7 14 22 -9
213 7 13 40 -9
228 7 12 58 -9
248 7 12 10 -8
268 7 12 8 -8 nivrtti
293 7 12 51 -7
318 7 14 19 -7
348 7 16 59 -7
363 - - - astam
378 7 20 22 -7
C29
15 - - - udaya
30 7 23 48 -7
60 7 26 40 -7
85 7 28 20 -7
110 7 29 18 -7
130 7 29 25 -7 vakra
150 7 28 59 -8
165 7 28 16 -8
175 7 27 35 -8
185 7 26 52 -8
193 7 26 12 -8
203 7 25 24 -8
213 7 24 42 -8
228 7 23 52 -8
248 7 23 16 -7 nivrtti
268 7 23 15 -7
293 7 23 59 -7
318 7 25 36 -7
348 7 28 20 -7
363 - - - astam
378 8 1 42 -7
# end Saturn (29 cycles); closing 'kamesah' (551). Colophon variant: Mercury 528, Jupiter 231, Venus 165, Saturn 551 vakyas; cycles Ma15 Me22 Ju11 Ve5 Sa29.
```

---
# E. MAKARANDA SĀRIṆĪ (Saurapakṣa tables) — chosen for the `ss-ranganatha` option

**Who wrote it.** The Makaranda sāriṇī (MKS) is by **Makaranda, son of Ānanda, at Kāśī, 1478 CE (Śaka 1400)**. It is not by Raṅganātha. Raṅganātha wrote the Gūḍhārthaprakāśikā commentary on the Sūrya Siddhānta in 1603, ~125 years later. The two belong to the same Saurapakṣa almanac tradition of Kāśī. The MKS is the standard "updated Sūrya Siddhānta" used by Saurapakṣa pañcāṅga makers (Bihar, Bengal, Varanasi, north India). Its main commentary, with worked examples, is Viśvanātha Daivajña's *Udāharaṇa* (Śaka 1540 = 1618 CE). Others: Divākara's *Makaranda-vivaraṇa*, Gokulanātha's *Upapatti* (1766 CE) and Nārāyaṇa Śarmā's *Makarandaprakāśa* (1909 CE). Printed edition: *Sodāharaṇa Makaranda sāriṇī*, Śrī Veṅkaṭeśvara Press, Bombay, 1913.

The Raṅganātha SS edition in this folder (section D) does not quote or explain the MKS. Its only bīja is the Bījopanayana passage in section D. I did not full-text search the book: it is a scan with no text layer, and I read only the relevant chapters.

**The MKS bīja and the section-D Bījopanayana bīja are different corrections.** MKS: fixed revolution changes (E2). Bījopanayana: a time-varying B with other multipliers.

Sources (all three papers read in full):
- K. Rupa, P. Venugopal, S. Balachandra Rao, "Makaranda Sāriṇī and allied Saurapakṣa tables – a study", *IJHS* 49.2 (2014) 186–208 — https://ancientindianastronomy.wordpress.com/wp-content/uploads/2016/02/ijhs-vol49_2_9_krupa.pdf
- S. Balachandra Rao, K. Rupa, P. Venugopal, "An analysis of the mandaphala tables of Makaranda and revision of parameters", *Gaṇita Bhāratī* 35 (2013) 221–240 — https://ancientindianastronomy.files.wordpress.com/2016/02/gb-chap-10-may-14vol-15-no-11.pdf
- S.K. Uma, S. Balachandra Rao, "Ahargaṇa in Makarandasāriṇī and other Indian astronomical texts", *IJHS* 53.1 (2018) — https://insa.nic.in/writereaddata/UpLoadedFiles/IJHS/Vol53_1_2018__Art02.pdf

## E1. Day count (ahargaṇa)
- The MKS ahargaṇa is the **Kali ahargaṇa**: civil days from the Kali epoch (Friday, mean **midnight** between 17/18 Feb 3102 BCE, Laṅkā/Ujjain meridian). At that instant all mean bodies are at 0° Meṣa, as in plain SS.
- The tables give it as an *ahargaṇa-vallī*: the day count written in base-60 digits, labelled rāśi|aṁśa|kalā|vikalā, so r|a|k|v = r·60³ + a·60² + k·60 + v days. It is tabulated every 57 years, from Śaka 1628 in the printed (Viśvanātha) edition. The step per 57 years is vallī 0|5|46|59 and weekday +1.
- Implementation: use the app's existing SS Kali-day count (midnight epoch). Nothing new is needed.

## E2. Mean motions (vāṭikā tables) = the MKS bīja
The MKS vāṭikā tables tabulate 10×(motion for n days). Dividing out gives these mean daily motions (sexagesimal, degrees; IJHS 2014 Table 5.1). Revolutions per Mahāyuga (MY) of 4,320,000 solar years:

| Body | Mean daily motion (° ′ ″ ‴ iv v vi vii) | MKS revs/MY | SS revs/MY | Bīja |
|---|---|---|---|---|
| Sun | 0 59 08 10 10 24 12 30 (= 0.9856026705264996°/day) | 4,320,000 | 4,320,000 | civil days 1,577,917,802 vs SS 1,577,917,828 → **−26 days** |
| Moon | 13 10 34 52 03 49 08 0 | 57,753,335.0879 | 57,753,336 | −1 |
| Moon's apogee | 0 06 40 58 30 41 28 0 | 488,198.9998 | 488,203 | −4 |
| Rāhu (retrograde) | −0 03 10 44 43 51 0 31 | 232,238.5688 | 232,238 | +0.57 |
| Mars | 0 31 26 28 11 08 56 30 | 2,296,831.8929 | 2,296,832 | 0 |
| Mercury śīghra | 4 05 32 21 29 09 48 30 | 17,937,075.7218 | 17,937,060 | **+16** |
| Jupiter | 0 04 59 08 48 56 31 30 | 364,212.0116 | 364,220 | **−8** |
| Venus śīghra | 1 36 07 43 01 47 58 48 | 7,022,363.9911 | 7,022,376 | **−12** |
| Saturn | 0 02 00 23 28 54 40 42 | 146,580.0052 | 146,568 | **+12** |

- The bīja is the integer revolution change per MY with civil days 1,577,917,802: Moon −1, apogee −4, Rāhu ≈ +0.57, Mars 0, Mercury +16, Jupiter −8, Venus −12, Saturn +12. This matches the well-known "Sūrya Siddhānta bīja" of the Saurapakṣa almanacs.
- Implied sidereal year: 360/SDM = 365.258750575 days (SS: 365.258756481), i.e. 0.51 s shorter.
- **Mean longitude** = (MKS daily motion) × Kali-days at midnight, plus the SS epoch value. That value is 0 for all bodies except Moon's apogee (+90°) and Rāhu (180°, retrograde), as in SS ch.1. Planetary mandocca and pāta stay as in plain SS (the app's `ss` method).
- VERIFY: the MKS vāṭikā tables are increments. That they start from the same Kali-zero positions follows from the bīja being stated as revolutions per MY, but no MKS kṣepaka table was available to confirm it. Test against Viśvanātha's examples when the 1913 edition is available.

## E3. True planets: three steps instead of SS's four
Plain SS (Spaṣṭādhikāra) uses four steps:
1. Apply ½ śīghraphala to the mean planet.
2. Apply ½ mandaphala.
3. Recompute the mandaphala from that position and apply it in full to the *mean* planet.
4. Apply the full śīghraphala to the result.

**MKS uses three steps** (Gaṇita Bhāratī 2013, §3):
1. P1 = MP + ½·SE1, where SK1 = śīghrocca − MP (same as SS step 1).
2. P2 = MP + MPH2, applied once to the mean planet. MPH2 is Makaranda's combined manda table:
   - Define f(MK) = asin((p/360)·sin MK) with p = pe − (pe − po)·|sin MK|. This is the SS mandaphala, sin MPH = (p/360)·sin MK.
   - With MK1 = mandocca − P1 (taken 0–180°; mirror for 180–360°), MPH1 = f(MK1).
   - Then **MPH2 = f(MK1 − ½·MPH1)**. That is, the anomaly is pulled back by half the first equation, and the equation is recomputed with the paridhi re-evaluated at the new anomaly.
   - Sign as usual: the planet is decreased for MK 0–180°, increased for 180–360° (MK measured from the planet to the mandocca).
   - I checked this numerically against the Mars table (Gaṇita Bhāratī eqs 5.1–5.3 state it loosely as "adding half the mandaphala"): MK 15° → 165.3′, 90° → 689.0′, 105° → 683.1′. These match the MKS 165, 689 and 683.
   - Their recomputed MPH2 reproduces the MKS tables to the integer arc-minute (Mars: MK 15° → 165′, 30° → 320′, 45° → 458′, 60° → 570′, 75° → 649′, 90° → 689′, 105° → 683′, 120° → 629′, 135° → 527′, 150° → 381′, 165° → 202′).
   - The maximum falls beyond 90°. Critical MK and maximum MPH (paper Table 5.3): Mars 95.74°, 692.2′; Mercury 92.23°, 697.65′ (VERIFY: the paper's own per-degree table peaks ~267.6′ for Mercury, so 697.65 looks like a misprint); Jupiter 92.55°, 305.98′; Venus 90.88°, 105.06′; Saturn 93.82°, 459.74′.
3. P3 = P2 + SE2, where SK2 = śīghrocca − P2; full śīghraphala with the SS formula and variable śīghra paridhi.

**Sun and Moon:** a single mandaphala f(MK), as in SS. The MKS Sun table agrees with the SS formula within ~5″: MK 10° → 23′07″, 20° → 45′22″, 30° → 66′02″, 40° → 84′42″, 50° → 100′36″, 60° → 113′25″, 70° → 122′51″, 80° → 128′35″, 90° → 130′32″.

**Epicycles (SS values, used unchanged by MKS)**, in degrees:

| Body | Manda: MK 0/180 / MK 90/270 | Śīghra: SK 0/180 / SK 90/270 |
|---|---|---|
| Sun | 14 / 13°40′ | – |
| Moon | 32 / 31°40′ | – |
| Mars | 75 / 72 | 235 / 232 |
| Mercury | 30 / 28 | 133 / 132 |
| Jupiter | 33 / 32 | 70 / 72 |
| Venus | 12 / 11 | 262 / 260 |
| Saturn | 49 / 48 | 39 / 40 |

- Each paridhi varies as p = pe − (pe − po)·|sin K|.
- Śīghraphala (SS ch.2): sin SP = (p/360)·R·sin SK / SKR, with SKR = √[(R + (p/360)·R·cos SK)² + ((p/360)·R·sin SK)²] and R = 3438′. SP is positive when SK < 180°.
- Worked check from the 2014 paper: Saturn, SK = 62.0406°, p = 39.88328° gives SP = +5°18′53″.
- The MKS śīghra tables (per degree, in degrees and arc-minutes) follow this SS formula closely. Venus samples are compared with Grahalāghava in IJHS 2014 Table 9.6.

## E4. Other MKS details (from the papers)
- Sun's declination: tables at 6° steps of the sāyana bhuja, in ghaṭī units (×6 = degrees), with ε = 24°.
- Moon's latitude: a śara table on the bhuja of (Moon − Rāhu).
- Tithi, nakṣatra and yoga "kanda/vallī" tables per 16 or 24 years (calendar only, not needed for sphuṭa).
- Ayanāṁśa in Viśvanātha's MKS example: 16°39′54″ for Śaka 1534 (1612 CE). That is SS-style trepidation: Kali 3600 = 0, 54″/yr, ±27°. Check: (4713 − 3600)·54″ = 16°41′, close.

## E6. Which bīja is "Raṅganātha's"? (checked 2026-11-14)
A claim was circulating (an AI search summary) that Raṅganātha's 1603 commentary gives the bīja Moon −1, apogee −4, Rāhu +4, Mars +4, Mercury +16, Jupiter −8, Venus −12, Saturn +12. **That claim is not supported by the sources.**

- **Raṅganātha's Gūḍhārthaprakāśaka itself** (this folder's Khemraj edition, plus a text search of the 1859 Bibliotheca Indica edition, Hall & Bāpū Deva Śāstrī) gives no revolution-number bīja in ch.1. The only bīja passage is the Bījopanayana he quotes under ch.14 v.23 (section D), and he calls its placement in the text incongruous. No mention of Makaranda was found (the 1859 text layer is OCR, so this is not certain).
- **Burgess, *Translation of the Sūrya-Siddhānta*** (JAOS 6, 1860), note to i.29–34, pp.163–164, gives "Mean motions of the planets as corrected by the bīja". He takes them from Bentley (*Hindu Astronomy*, p.179), not from Raṅganātha. They were first applied about the beginning of the 16th century; Burgess's own analysis puts it at ~A.D. 1541. All are multiples of 4, per 4,320,000 years.
- **Makaranda's** values (section E2) come from his vāṭikā daily motions (Rupa et al. 2014).

| Body | SS revs/MY | Bentley/Burgess bīja (corrected revs) | Makaranda (revs) | AI summary's "Raṅganātha" |
|---|---|---|---|---|
| Sun | 4,320,000 | 0 | 0 (civil days −26) | 0 |
| Moon | 57,753,336 | **0** | −1 (57,753,335.09) | −1 |
| Moon's apogee | 488,203 | −4 (488,199) | −4 (488,199.00) | −4 |
| Rāhu | 232,238 | **+4** (232,242) | +0.57 (232,238.57) | +4 |
| Mars | 2,296,832 | **0** | 0 | +4 ✗ |
| Mercury śīghra | 17,937,060 | **−16** (17,937,044) | **+16** (17,937,075.72) | +16 |
| Jupiter | 364,220 | −8 (364,212) | −8 | −8 |
| Venus śīghra | 7,022,376 | −12 (7,022,364) | −12 | −12 |
| Saturn | 146,568 | +12 (146,580) | +12 | +12 |

Burgess's corrected daily motions (p.164): Sun 0°59′8″10‴.4, Mercury 4°5′32″19‴54.5, Venus 1°36′7″43‴1.8, Mars 0°31′26″28‴11.1, Jupiter 0°4′59″8‴24.9, Saturn 0°2′0″23‴28.9, Moon 13°10′34″52‴3.8, apsis 0°6′40″58‴30.7, node 0°3′10″44‴55.0.

Conclusions:
- Bentley's bīja and Makaranda's agree for the apogee (−4), Jupiter (−8), Venus (−12), Saturn (+12) and Mars (0).
- They differ in three places:
  - **Mercury's sign:** Bentley −16, Makaranda +16. Makaranda's tabulated Mercury motion 4°5′32″21‴29 is faster than SS, and Bentley's 4°5′32″19‴54 is slower. Burgess also notes (xii.90) that the −16 value reproduces the text's Mercury orbit.
  - **Moon:** Bentley 0, Makaranda −1.
  - **Rāhu:** Bentley +4, Makaranda ≈ +0.6.
- Makaranda (1478) is the earliest dated source for this family of bīja. "Raṅganātha followed Makaranda" may be true of the Kāśī almanac practice of his day, but Raṅganātha's commentary does not state it.
- The AI summary's "Mars +4 (supplied)" matches neither source. VERIFY before using.
- For the app, the options are:
  - (a) Bentley/Burgess bīja, the "SS with bīja" of 19th-century almanacs;
  - (b) Makaranda's exact vāṭikā motions with the 3-step true-planet procedure (E3).
  Either is a defensible "updated SS".
- **DECIDED (user, 2026-11-14): `ss-ranganatha` = option (b), Makaranda.** Use the E2 vāṭikā motions (Moon −1, apogee −4, Rāhu +0.57, Mars 0, Mercury +16, Jupiter −8, Venus −12, Saturn +12, civil days −26) and the E3 three-step true planet, as in E5. Do not use the Bentley/Burgess values for this option.

## E5. How to implement `ss-ranganatha` (Makaranda; decided 2026-11-14)
1. Take the plain SS pipeline as it is.
2. Replace the mean-motion rates with the MKS rates in E2: civil days/MY 1,577,917,802 and revolutions per the table. Epoch values unchanged.
3. Replace SS steps 2–3 (½ manda, then full manda recomputed) with Makaranda's single combined MPH2 (E3).
4. Keep the śīghra steps, epicycles, ayanāṁśa and sunrise rules as in plain SS.
