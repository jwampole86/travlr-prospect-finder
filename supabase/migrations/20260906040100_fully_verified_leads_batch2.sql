-- Migration: Insert prospect_leads_with_phones__2_ as Fully Verified
-- Source: prospect_leads_with_phones__2_.csv (113 leads)

DO $$
BEGIN

INSERT INTO public.leads (
  id, address, owner_name, phone, secondary_phones, all_phones_raw,
  verified_owner, verified_number, verified_address,
  verified_owner_source, verified_number_source,
  ingestion_source, import_source_name, import_source_file,
  research_source, source, stage,
  created_at, updated_at
) VALUES

(gen_random_uuid(),'101 N Clematis St West Palm Beach, FL 33401','Haven Palm Beach','(561) 960-4505',ARRAY[]::text[],'(561) 960-4505',true,true,'101 N Clematis St West Palm Beach, FL 33401','TruePeopleSearch','TruePeopleSearch','CSV_IMPORT','prospect_leads_with_phones__2_','prospect_leads_with_phones__2_.csv','TruePeopleSearch','Direct'::public.lead_source,'New Lead'::public.lead_stage,now(),now()),

(gen_random_uuid(),'10367 E Wood Dr Scottsdale, AZ 85260','Dina and Mark Beauvais','(623) 887-5624',ARRAY[]::text[],'(623) 887-5624',true,true,'10367 E Wood Dr Scottsdale, AZ 85260','TruePeopleSearch','TruePeopleSearch','CSV_IMPORT','prospect_leads_with_phones__2_','prospect_leads_with_phones__2_.csv','TruePeopleSearch','Direct'::public.lead_source,'New Lead'::public.lead_stage,now(),now()),

(gen_random_uuid(),'1072 Urania Ave Encinitas, CA 92024','Mac & Nima Sohrabi','(619) 247-0112',ARRAY[]::text[],'(619) 247-0112',true,true,'1072 Urania Ave Encinitas, CA 92024','TruePeopleSearch','TruePeopleSearch','CSV_IMPORT','prospect_leads_with_phones__2_','prospect_leads_with_phones__2_.csv','TruePeopleSearch','Direct'::public.lead_source,'New Lead'::public.lead_stage,now(),now()),

(gen_random_uuid(),'10811 Labelle Ct Truckee, CA 96161','Annette merriman','(415) 689-4555',ARRAY[]::text[],'(415) 689-4555',true,true,'10811 Labelle Ct Truckee, CA 96161','TruePeopleSearch','TruePeopleSearch','CSV_IMPORT','prospect_leads_with_phones__2_','prospect_leads_with_phones__2_.csv','TruePeopleSearch','Direct'::public.lead_source,'New Lead'::public.lead_stage,now(),now()),

(gen_random_uuid(),'1101 Pembroke Ln Newport Beach, CA 92660','Colleen Osborne','(949) 230-2479',ARRAY[]::text[],'(949) 230-2479',true,true,'1101 Pembroke Ln Newport Beach, CA 92660','TruePeopleSearch','TruePeopleSearch','CSV_IMPORT','prospect_leads_with_phones__2_','prospect_leads_with_phones__2_.csv','TruePeopleSearch','Direct'::public.lead_source,'New Lead'::public.lead_stage,now(),now()),

(gen_random_uuid(),'113 Seale Ave Palo Alto, CA 94301','Cathy Muma','(415) 676-1200',ARRAY[]::text[],'(415) 676-1200',true,true,'113 Seale Ave Palo Alto, CA 94301','TruePeopleSearch','TruePeopleSearch','CSV_IMPORT','prospect_leads_with_phones__2_','prospect_leads_with_phones__2_.csv','TruePeopleSearch','Direct'::public.lead_source,'New Lead'::public.lead_stage,now(),now()),

(gen_random_uuid(),'1134 Abrigo Rd Palm Springs, CA 92262','Phillip LeBlanc','(949) 715-5509',ARRAY[]::text[],'(949) 715-5509',true,true,'1134 Abrigo Rd Palm Springs, CA 92262','TruePeopleSearch','TruePeopleSearch','CSV_IMPORT','prospect_leads_with_phones__2_','prospect_leads_with_phones__2_.csv','TruePeopleSearch','Direct'::public.lead_source,'New Lead'::public.lead_stage,now(),now()),

(gen_random_uuid(),'1141 Muirlands Vista Way La Jolla, CA 92037','Marc Karlsberg','(626) 233-1390',ARRAY[]::text[],'(626) 233-1390',true,true,'1141 Muirlands Vista Way La Jolla, CA 92037','TruePeopleSearch','TruePeopleSearch','CSV_IMPORT','prospect_leads_with_phones__2_','prospect_leads_with_phones__2_.csv','TruePeopleSearch','Direct'::public.lead_source,'New Lead'::public.lead_stage,now(),now()),

(gen_random_uuid(),'1159 Diamond St San Diego, CA 92109','ReadyHomes','(442) 313-2093',ARRAY[]::text[],'(442) 313-2093',true,true,'1159 Diamond St San Diego, CA 92109','TruePeopleSearch','TruePeopleSearch','CSV_IMPORT','prospect_leads_with_phones__2_','prospect_leads_with_phones__2_.csv','TruePeopleSearch','Direct'::public.lead_source,'New Lead'::public.lead_stage,now(),now()),

(gen_random_uuid(),'11700 SW 22nd Ct Davie, FL 33325','ROCKET REAL ESTATE','(786) 933-5526',ARRAY[]::text[],'(786) 933-5526',true,true,'11700 SW 22nd Ct Davie, FL 33325','TruePeopleSearch','TruePeopleSearch','CSV_IMPORT','prospect_leads_with_phones__2_','prospect_leads_with_phones__2_.csv','TruePeopleSearch','Direct'::public.lead_source,'New Lead'::public.lead_stage,now(),now()),

(gen_random_uuid(),'119 Via Santo Tomas Rancho Mirage, CA 92270','Randy Bloom','(760) 285-2800',ARRAY[]::text[],'(760) 285-2800',true,true,'119 Via Santo Tomas Rancho Mirage, CA 92270','TruePeopleSearch','TruePeopleSearch','CSV_IMPORT','prospect_leads_with_phones__2_','prospect_leads_with_phones__2_.csv','TruePeopleSearch','Direct'::public.lead_source,'New Lead'::public.lead_stage,now(),now()),

(gen_random_uuid(),'1209 Midwickhill Dr Alhambra, CA 91803','Han','(818) 532-0125',ARRAY[]::text[],'(818) 532-0125',true,true,'1209 Midwickhill Dr Alhambra, CA 91803','TruePeopleSearch','TruePeopleSearch','CSV_IMPORT','prospect_leads_with_phones__2_','prospect_leads_with_phones__2_.csv','TruePeopleSearch','Direct'::public.lead_source,'New Lead'::public.lead_stage,now(),now()),

(gen_random_uuid(),'12439 Kling St Studio City, CA 91604','Han','(626) 649-5406',ARRAY[]::text[],'(626) 649-5406',true,true,'12439 Kling St Studio City, CA 91604','TruePeopleSearch','TruePeopleSearch','CSV_IMPORT','prospect_leads_with_phones__2_','prospect_leads_with_phones__2_.csv','TruePeopleSearch','Direct'::public.lead_source,'New Lead'::public.lead_stage,now(),now()),

(gen_random_uuid(),'1250 Sound Dr Greenport, NY 11944','busra Kim','(914) 745-2069',ARRAY[]::text[],'(914) 745-2069',true,true,'1250 Sound Dr Greenport, NY 11944','TruePeopleSearch','TruePeopleSearch','CSV_IMPORT','prospect_leads_with_phones__2_','prospect_leads_with_phones__2_.csv','TruePeopleSearch','Direct'::public.lead_source,'New Lead'::public.lead_stage,now(),now()),

(gen_random_uuid(),'12935 E Gold Dust Ave Scottsdale, AZ 85259','Lance','(480) 672-4650',ARRAY[]::text[],'(480) 672-4650',true,true,'12935 E Gold Dust Ave Scottsdale, AZ 85259','TruePeopleSearch','TruePeopleSearch','CSV_IMPORT','prospect_leads_with_phones__2_','prospect_leads_with_phones__2_.csv','TruePeopleSearch','Direct'::public.lead_source,'New Lead'::public.lead_stage,now(),now()),

(gen_random_uuid(),'1319 S Irena Ave Redondo Beach, CA 90277','Larry Hess','(213) 772-4054',ARRAY[]::text[],'(213) 772-4054',true,true,'1319 S Irena Ave Redondo Beach, CA 90277','TruePeopleSearch','TruePeopleSearch','CSV_IMPORT','prospect_leads_with_phones__2_','prospect_leads_with_phones__2_.csv','TruePeopleSearch','Direct'::public.lead_source,'New Lead'::public.lead_stage,now(),now()),

(gen_random_uuid(),'1324 E Pomelo Grove Ln Phoenix, AZ 85014','Proper Living','(480) 480-5542',ARRAY[]::text[],'(480) 480-5542',true,true,'1324 E Pomelo Grove Ln Phoenix, AZ 85014','TruePeopleSearch','TruePeopleSearch','CSV_IMPORT','prospect_leads_with_phones__2_','prospect_leads_with_phones__2_.csv','TruePeopleSearch','Direct'::public.lead_source,'New Lead'::public.lead_stage,now(),now()),

(gen_random_uuid(),'13318 Mulholland Dr Beverly Hills, CA 90210','Michael Edson','(310) 569-0490',ARRAY[]::text[],'(310) 569-0490',true,true,'13318 Mulholland Dr Beverly Hills, CA 90210','TruePeopleSearch','TruePeopleSearch','CSV_IMPORT','prospect_leads_with_phones__2_','prospect_leads_with_phones__2_.csv','TruePeopleSearch','Direct'::public.lead_source,'New Lead'::public.lead_stage,now(),now()),

(gen_random_uuid(),'134 Royal Saint Georges Way Rancho Mirage, CA 92270','Mario Gamboa','(949) 230-8901',ARRAY[]::text[],'(949) 230-8901',true,true,'134 Royal Saint Georges Way Rancho Mirage, CA 92270','TruePeopleSearch','TruePeopleSearch','CSV_IMPORT','prospect_leads_with_phones__2_','prospect_leads_with_phones__2_.csv','TruePeopleSearch','Direct'::public.lead_source,'New Lead'::public.lead_stage,now(),now()),

(gen_random_uuid(),'1410 W Colonial Pkwy Roseville, CA 95661','Maria Sechler','(916) 209-6380',ARRAY[]::text[],'(916) 209-6380',true,true,'1410 W Colonial Pkwy Roseville, CA 95661','TruePeopleSearch','TruePeopleSearch','CSV_IMPORT','prospect_leads_with_phones__2_','prospect_leads_with_phones__2_.csv','TruePeopleSearch','Direct'::public.lead_source,'New Lead'::public.lead_stage,now(),now()),

(gen_random_uuid(),'1417 High Bluff Dr Newport Beach, CA 92660','Alex Aydin','(949) 836-4900',ARRAY[]::text[],'(949) 836-4900',true,true,'1417 High Bluff Dr Newport Beach, CA 92660','TruePeopleSearch','TruePeopleSearch','CSV_IMPORT','prospect_leads_with_phones__2_','prospect_leads_with_phones__2_.csv','TruePeopleSearch','Direct'::public.lead_source,'New Lead'::public.lead_stage,now(),now()),

(gen_random_uuid(),'1419 Oberlin Ave Thousand Oaks, CA 91360','Sean Dubravac','(310) 488-0056',ARRAY[]::text[],'(310) 488-0056',true,true,'1419 Oberlin Ave Thousand Oaks, CA 91360','TruePeopleSearch','TruePeopleSearch','CSV_IMPORT','prospect_leads_with_phones__2_','prospect_leads_with_phones__2_.csv','TruePeopleSearch','Direct'::public.lead_source,'New Lead'::public.lead_stage,now(),now()),

(gen_random_uuid(),'1420 Jewel Box Ave Naples, FL 34102','Karolina Kasbi','(952) 209-0378',ARRAY[]::text[],'(952) 209-0378',true,true,'1420 Jewel Box Ave Naples, FL 34102','TruePeopleSearch','TruePeopleSearch','CSV_IMPORT','prospect_leads_with_phones__2_','prospect_leads_with_phones__2_.csv','TruePeopleSearch','Direct'::public.lead_source,'New Lead'::public.lead_stage,now(),now()),

(gen_random_uuid(),'1438 Hillcrest Rd Santa Barbara, CA 93103','Ben Anapol','(631) 793-9128',ARRAY[]::text[],'(631) 793-9128',true,true,'1438 Hillcrest Rd Santa Barbara, CA 93103','TruePeopleSearch','TruePeopleSearch','CSV_IMPORT','prospect_leads_with_phones__2_','prospect_leads_with_phones__2_.csv','TruePeopleSearch','Direct'::public.lead_source,'New Lead'::public.lead_stage,now(),now()),

(gen_random_uuid(),'15213 N 51st PI Scottsdale, AZ 85254','Danielle Witte','(983) 955-8305',ARRAY[]::text[],'(983) 955-8305',true,true,'15213 N 51st PI Scottsdale, AZ 85254','TruePeopleSearch','TruePeopleSearch','CSV_IMPORT','prospect_leads_with_phones__2_','prospect_leads_with_phones__2_.csv','TruePeopleSearch','Direct'::public.lead_source,'New Lead'::public.lead_stage,now(),now()),

(gen_random_uuid(),'15316 Del Gado Dr Sherman Oaks, CA 91403','Rosalie Heller','(917) 779-0358',ARRAY[]::text[],'(917) 779-0358',true,true,'15316 Del Gado Dr Sherman Oaks, CA 91403','TruePeopleSearch','TruePeopleSearch','CSV_IMPORT','prospect_leads_with_phones__2_','prospect_leads_with_phones__2_.csv','TruePeopleSearch','Direct'::public.lead_source,'New Lead'::public.lead_stage,now(),now()),

(gen_random_uuid(),'15325 Bridger Canyon Rd Bozeman, MT 59715','Patrick O''Neill','(415) 532-8359',ARRAY[]::text[],'(415) 532-8359',true,true,'15325 Bridger Canyon Rd Bozeman, MT 59715','TruePeopleSearch','TruePeopleSearch','CSV_IMPORT','prospect_leads_with_phones__2_','prospect_leads_with_phones__2_.csv','TruePeopleSearch','Direct'::public.lead_source,'New Lead'::public.lead_stage,now(),now()),

(gen_random_uuid(),'1709 SW 5th St Fort Lauderdale, FL 33312','Luis','(786) 738-9660',ARRAY[]::text[],'(786) 738-9660',true,true,'1709 SW 5th St Fort Lauderdale, FL 33312','TruePeopleSearch','TruePeopleSearch','CSV_IMPORT','prospect_leads_with_phones__2_','prospect_leads_with_phones__2_.csv','TruePeopleSearch','Direct'::public.lead_source,'New Lead'::public.lead_stage,now(),now()),

(gen_random_uuid(),'177 NE Spanish Ct Boca Raton, FL 33432','Andrew Nissley','(407) 986-1938',ARRAY[]::text[],'(407) 986-1938',true,true,'177 NE Spanish Ct Boca Raton, FL 33432','TruePeopleSearch','TruePeopleSearch','CSV_IMPORT','prospect_leads_with_phones__2_','prospect_leads_with_phones__2_.csv','TruePeopleSearch','Direct'::public.lead_source,'New Lead'::public.lead_stage,now(),now()),

(gen_random_uuid(),'1816 Atherton Ct Lawrence, KS 66044','Megan Jacobs','(816) 375-2603',ARRAY[]::text[],'(816) 375-2603',true,true,'1816 Atherton Ct Lawrence, KS 66044','TruePeopleSearch','TruePeopleSearch','CSV_IMPORT','prospect_leads_with_phones__2_','prospect_leads_with_phones__2_.csv','TruePeopleSearch','Direct'::public.lead_source,'New Lead'::public.lead_stage,now(),now()),

(gen_random_uuid(),'1820 Julian St Denver, CO 80204','J Lowe','(202) 851-9579',ARRAY[]::text[],'(202) 851-9579',true,true,'1820 Julian St Denver, CO 80204','TruePeopleSearch','TruePeopleSearch','CSV_IMPORT','prospect_leads_with_phones__2_','prospect_leads_with_phones__2_.csv','TruePeopleSearch','Direct'::public.lead_source,'New Lead'::public.lead_stage,now(),now()),

(gen_random_uuid(),'2001 Lincoln St Denver, CO 80202','Christina Bernardin','(812) 312-5041',ARRAY[]::text[],'(812) 312-5041',true,true,'2001 Lincoln St Denver, CO 80202','TruePeopleSearch','TruePeopleSearch','CSV_IMPORT','prospect_leads_with_phones__2_','prospect_leads_with_phones__2_.csv','TruePeopleSearch','Direct'::public.lead_source,'New Lead'::public.lead_stage,now(),now()),

(gen_random_uuid(),'2009 Quail Creek Dr Lawrence, KS 66047','Cynthia Erland','(213) 693-2754',ARRAY[]::text[],'(213) 693-2754',true,true,'2009 Quail Creek Dr Lawrence, KS 66047','TruePeopleSearch','TruePeopleSearch','CSV_IMPORT','prospect_leads_with_phones__2_','prospect_leads_with_phones__2_.csv','TruePeopleSearch','Direct'::public.lead_source,'New Lead'::public.lead_stage,now(),now()),

(gen_random_uuid(),'2030 S Franklin St Denver, CO 80210','Babu Venugopal','(720) 897-1825',ARRAY[]::text[],'(720) 897-1825',true,true,'2030 S Franklin St Denver, CO 80210','TruePeopleSearch','TruePeopleSearch','CSV_IMPORT','prospect_leads_with_phones__2_','prospect_leads_with_phones__2_.csv','TruePeopleSearch','Direct'::public.lead_source,'New Lead'::public.lead_stage,now(),now()),

(gen_random_uuid(),'2036 Eliot St Denver, CO 80211','Marty Coltrane, Broker Owner','(405) 299-0270',ARRAY[]::text[],'(405) 299-0270',true,true,'2036 Eliot St Denver, CO 80211','TruePeopleSearch','TruePeopleSearch','CSV_IMPORT','prospect_leads_with_phones__2_','prospect_leads_with_phones__2_.csv','TruePeopleSearch','Direct'::public.lead_source,'New Lead'::public.lead_stage,now(),now()),

(gen_random_uuid(),'2099 E Racquet Club Rd Palm Springs, CA 92262','Al (Almahdi Amtoun)','(202) 329-3992',ARRAY[]::text[],'(202) 329-3992',true,true,'2099 E Racquet Club Rd Palm Springs, CA 92262','TruePeopleSearch','TruePeopleSearch','CSV_IMPORT','prospect_leads_with_phones__2_','prospect_leads_with_phones__2_.csv','TruePeopleSearch','Direct'::public.lead_source,'New Lead'::public.lead_stage,now(),now()),

(gen_random_uuid(),'2154 Ranch View Ter Encinitas, CA 92024','Jesse Morgan','(206) 736-3557',ARRAY[]::text[],'(206) 736-3557',true,true,'2154 Ranch View Ter Encinitas, CA 92024','TruePeopleSearch','TruePeopleSearch','CSV_IMPORT','prospect_leads_with_phones__2_','prospect_leads_with_phones__2_.csv','TruePeopleSearch','Direct'::public.lead_source,'New Lead'::public.lead_stage,now(),now()),

(gen_random_uuid(),'218 San Rafael Ave Belvedere, CA 94920','Corinth Realty Partners, LLC','(646) 907-6146',ARRAY[]::text[],'(646) 907-6146',true,true,'218 San Rafael Ave Belvedere, CA 94920','TruePeopleSearch','TruePeopleSearch','CSV_IMPORT','prospect_leads_with_phones__2_','prospect_leads_with_phones__2_.csv','TruePeopleSearch','Direct'::public.lead_source,'New Lead'::public.lead_stage,now(),now()),

(gen_random_uuid(),'21864 SE 1st St Sammamish, WA 98074','Ana Beskin','(571) 500-3862',ARRAY[]::text[],'(571) 500-3862',true,true,'21864 SE 1st St Sammamish, WA 98074','TruePeopleSearch','TruePeopleSearch','CSV_IMPORT','prospect_leads_with_phones__2_','prospect_leads_with_phones__2_.csv','TruePeopleSearch','Direct'::public.lead_source,'New Lead'::public.lead_stage,now(),now()),

(gen_random_uuid(),'2242 Jeffersonia Way Los Angeles, CA 90049','Kelsey Vinson','(404) 520-0835',ARRAY[]::text[],'(404) 520-0835',true,true,'2242 Jeffersonia Way Los Angeles, CA 90049','TruePeopleSearch','TruePeopleSearch','CSV_IMPORT','prospect_leads_with_phones__2_','prospect_leads_with_phones__2_.csv','TruePeopleSearch','Direct'::public.lead_source,'New Lead'::public.lead_stage,now(),now()),

(gen_random_uuid(),'23 Cross Rd Alford, MA 01266','Lauren, Property Owner','(908) 360-2727',ARRAY[]::text[],'(908) 360-2727',true,true,'23 Cross Rd Alford, MA 01266','TruePeopleSearch','TruePeopleSearch','CSV_IMPORT','prospect_leads_with_phones__2_','prospect_leads_with_phones__2_.csv','TruePeopleSearch','Direct'::public.lead_source,'New Lead'::public.lead_stage,now(),now()),

(gen_random_uuid(),'23321 Aldo Rd NW Poulsbo, WA 98370','Bob Strum','(206) 309-6826',ARRAY[]::text[],'(206) 309-6826',true,true,'23321 Aldo Rd NW Poulsbo, WA 98370','TruePeopleSearch','TruePeopleSearch','CSV_IMPORT','prospect_leads_with_phones__2_','prospect_leads_with_phones__2_.csv','TruePeopleSearch','Direct'::public.lead_source,'New Lead'::public.lead_stage,now(),now()),

(gen_random_uuid(),'236 Acadia Ter Celebration, FL 34747','Marc Burnetter','(804) 408-4373',ARRAY[]::text[],'(804) 408-4373',true,true,'236 Acadia Ter Celebration, FL 34747','TruePeopleSearch','TruePeopleSearch','CSV_IMPORT','prospect_leads_with_phones__2_','prospect_leads_with_phones__2_.csv','TruePeopleSearch','Direct'::public.lead_source,'New Lead'::public.lead_stage,now(),now()),

(gen_random_uuid(),'2386 S Alhambra Dr Palm Springs, CA 92264','Kenneth Lee Deavers','(619) 404-5658',ARRAY[]::text[],'(619) 404-5658',true,true,'2386 S Alhambra Dr Palm Springs, CA 92264','TruePeopleSearch','TruePeopleSearch','CSV_IMPORT','prospect_leads_with_phones__2_','prospect_leads_with_phones__2_.csv','TruePeopleSearch','Direct'::public.lead_source,'New Lead'::public.lead_stage,now(),now()),

(gen_random_uuid(),'2600 Meadows Dr Park City, UT 84060','Brenner Spear','(971) 533-5883',ARRAY[]::text[],'(971) 533-5883',true,true,'2600 Meadows Dr Park City, UT 84060','TruePeopleSearch','TruePeopleSearch','CSV_IMPORT','prospect_leads_with_phones__2_','prospect_leads_with_phones__2_.csv','TruePeopleSearch','Direct'::public.lead_source,'New Lead'::public.lead_stage,now(),now()),

(gen_random_uuid(),'2602 W 24th Ave Denver, CO 80211','Kendra Jablonski','(720) 358-9387',ARRAY[]::text[],'(720) 358-9387',true,true,'2602 W 24th Ave Denver, CO 80211','TruePeopleSearch','TruePeopleSearch','CSV_IMPORT','prospect_leads_with_phones__2_','prospect_leads_with_phones__2_.csv','TruePeopleSearch','Direct'::public.lead_source,'New Lead'::public.lead_stage,now(),now()),

(gen_random_uuid(),'2623 W Pumpkin Ridge Dr Anthem, AZ 85086','Samantha Maplethorpe','(425) 246-0225',ARRAY[]::text[],'(425) 246-0225',true,true,'2623 W Pumpkin Ridge Dr Anthem, AZ 85086','TruePeopleSearch','TruePeopleSearch','CSV_IMPORT','prospect_leads_with_phones__2_','prospect_leads_with_phones__2_.csv','TruePeopleSearch','Direct'::public.lead_source,'New Lead'::public.lead_stage,now(),now()),

(gen_random_uuid(),'2624 Providence Rd Charlotte, NC 28211','Ryan Shell','(980) 375-5013',ARRAY[]::text[],'(980) 375-5013',true,true,'2624 Providence Rd Charlotte, NC 28211','TruePeopleSearch','TruePeopleSearch','CSV_IMPORT','prospect_leads_with_phones__2_','prospect_leads_with_phones__2_.csv','TruePeopleSearch','Direct'::public.lead_source,'New Lead'::public.lead_stage,now(),now()),

(gen_random_uuid(),'27030 Meadow Way Carmel, CA 93923','Christopher Chambers','(510) 909-8083',ARRAY[]::text[],'(510) 909-8083',true,true,'27030 Meadow Way Carmel, CA 93923','TruePeopleSearch','TruePeopleSearch','CSV_IMPORT','prospect_leads_with_phones__2_','prospect_leads_with_phones__2_.csv','TruePeopleSearch','Direct'::public.lead_source,'New Lead'::public.lead_stage,now(),now()),

(gen_random_uuid(),'2770 Wright Ln Los Angeles, CA 90068','Otto Ho','(805) 268-6886',ARRAY[]::text[],'(805) 268-6886',true,true,'2770 Wright Ln Los Angeles, CA 90068','TruePeopleSearch','TruePeopleSearch','CSV_IMPORT','prospect_leads_with_phones__2_','prospect_leads_with_phones__2_.csv','TruePeopleSearch','Direct'::public.lead_source,'New Lead'::public.lead_stage,now(),now()),

(gen_random_uuid(),'2801 Flamingo Dr Miami Beach, FL 33140','Glenn Kendall','(786) 692-6246',ARRAY[]::text[],'(786) 692-6246',true,true,'2801 Flamingo Dr Miami Beach, FL 33140','TruePeopleSearch','TruePeopleSearch','CSV_IMPORT','prospect_leads_with_phones__2_','prospect_leads_with_phones__2_.csv','TruePeopleSearch','Direct'::public.lead_source,'New Lead'::public.lead_stage,now(),now()),

(gen_random_uuid(),'28080 Hayward Dr Castaic, CA 91384','Lindsey Capel','(480) 283-7317',ARRAY[]::text[],'(480) 283-7317',true,true,'28080 Hayward Dr Castaic, CA 91384','TruePeopleSearch','TruePeopleSearch','CSV_IMPORT','prospect_leads_with_phones__2_','prospect_leads_with_phones__2_.csv','TruePeopleSearch','Direct'::public.lead_source,'New Lead'::public.lead_stage,now(),now()),

(gen_random_uuid(),'3034 Wilson Ct Denver, CO 80205','Brent','(983) 223-1068',ARRAY[]::text[],'(983) 223-1068',true,true,'3034 Wilson Ct Denver, CO 80205','TruePeopleSearch','TruePeopleSearch','CSV_IMPORT','prospect_leads_with_phones__2_','prospect_leads_with_phones__2_.csv','TruePeopleSearch','Direct'::public.lead_source,'New Lead'::public.lead_stage,now(),now()),

(gen_random_uuid(),'304 Hidden Hollow Dr Jackson, WY 83001','suzannah Forbes','(617) 533-0557',ARRAY[]::text[],'(617) 533-0557',true,true,'304 Hidden Hollow Dr Jackson, WY 83001','TruePeopleSearch','TruePeopleSearch','CSV_IMPORT','prospect_leads_with_phones__2_','prospect_leads_with_phones__2_.csv','TruePeopleSearch','Direct'::public.lead_source,'New Lead'::public.lead_stage,now(),now()),

(gen_random_uuid(),'3155 Creston Eureka Rd Templeton, CA 93465','Monica Bennett','(818) 825-1687',ARRAY[]::text[],'(818) 825-1687',true,true,'3155 Creston Eureka Rd Templeton, CA 93465','TruePeopleSearch','TruePeopleSearch','CSV_IMPORT','prospect_leads_with_phones__2_','prospect_leads_with_phones__2_.csv','TruePeopleSearch','Direct'::public.lead_source,'New Lead'::public.lead_stage,now(),now()),

(gen_random_uuid(),'3355 Alcott St Denver, CO 80211','Ryan Walker','(720) 702-8109',ARRAY[]::text[],'(720) 702-8109',true,true,'3355 Alcott St Denver, CO 80211','TruePeopleSearch','TruePeopleSearch','CSV_IMPORT','prospect_leads_with_phones__2_','prospect_leads_with_phones__2_.csv','TruePeopleSearch','Direct'::public.lead_source,'New Lead'::public.lead_stage,now(),now()),

(gen_random_uuid(),'336 Garfield St Denver, CO 80206','Fred Birner','(720) 964-1048',ARRAY[]::text[],'(720) 964-1048',true,true,'336 Garfield St Denver, CO 80206','TruePeopleSearch','TruePeopleSearch','CSV_IMPORT','prospect_leads_with_phones__2_','prospect_leads_with_phones__2_.csv','TruePeopleSearch','Direct'::public.lead_source,'New Lead'::public.lead_stage,now(),now()),

(gen_random_uuid(),'35931 N 87th Way Scottsdale, AZ 85266','Thomas Silva','(602) 230-1511',ARRAY[]::text[],'(602) 230-1511',true,true,'35931 N 87th Way Scottsdale, AZ 85266','TruePeopleSearch','TruePeopleSearch','CSV_IMPORT','prospect_leads_with_phones__2_','prospect_leads_with_phones__2_.csv','TruePeopleSearch','Direct'::public.lead_source,'New Lead'::public.lead_stage,now(),now()),

(gen_random_uuid(),'3615 Corte Claro Carlsbad, CA 92009','Rob & Kristin Kerstner','(760) 805-0252',ARRAY[]::text[],'(760) 805-0252',true,true,'3615 Corte Claro Carlsbad, CA 92009','TruePeopleSearch','TruePeopleSearch','CSV_IMPORT','prospect_leads_with_phones__2_','prospect_leads_with_phones__2_.csv','TruePeopleSearch','Direct'::public.lead_source,'New Lead'::public.lead_stage,now(),now()),

(gen_random_uuid(),'3624 NW 65th Ct Seattle, WA 98117','Lianne Hall','(510) 924-8751',ARRAY[]::text[],'(510) 924-8751',true,true,'3624 NW 65th Ct Seattle, WA 98117','TruePeopleSearch','TruePeopleSearch','CSV_IMPORT','prospect_leads_with_phones__2_','prospect_leads_with_phones__2_.csv','TruePeopleSearch','Direct'::public.lead_source,'New Lead'::public.lead_stage,now(),now()),

(gen_random_uuid(),'3646 Potosi Ave Studio City, CA 91604','Zena Green','(213) 263-4216',ARRAY[]::text[],'(213) 263-4216',true,true,'3646 Potosi Ave Studio City, CA 91604','TruePeopleSearch','TruePeopleSearch','CSV_IMPORT','prospect_leads_with_phones__2_','prospect_leads_with_phones__2_.csv','TruePeopleSearch','Direct'::public.lead_source,'New Lead'::public.lead_stage,now(),now()),

(gen_random_uuid(),'3815 Hawick Ln Dallas, TX 75220','Sunny Patel','(858) 251-9036',ARRAY[]::text[],'(858) 251-9036',true,true,'3815 Hawick Ln Dallas, TX 75220','TruePeopleSearch','TruePeopleSearch','CSV_IMPORT','prospect_leads_with_phones__2_','prospect_leads_with_phones__2_.csv','TruePeopleSearch','Direct'::public.lead_source,'New Lead'::public.lead_stage,now(),now()),

(gen_random_uuid(),'3823 Via Manzana San Clemente, CA 92673','Han','(626) 341-0092',ARRAY[]::text[],'(626) 341-0092',true,true,'3823 Via Manzana San Clemente, CA 92673','TruePeopleSearch','TruePeopleSearch','CSV_IMPORT','prospect_leads_with_phones__2_','prospect_leads_with_phones__2_.csv','TruePeopleSearch','Direct'::public.lead_source,'New Lead'::public.lead_stage,now(),now()),

(gen_random_uuid(),'3833B 23rd Ave W Seattle, WA 98199','Tony Abinader','(415) 985-1932',ARRAY[]::text[],'(415) 985-1932',true,true,'3833B 23rd Ave W Seattle, WA 98199','TruePeopleSearch','TruePeopleSearch','CSV_IMPORT','prospect_leads_with_phones__2_','prospect_leads_with_phones__2_.csv','TruePeopleSearch','Direct'::public.lead_source,'New Lead'::public.lead_stage,now(),now()),

(gen_random_uuid(),'3873 Royal Woods Dr Sherman Oaks, CA 91403','Edmond Moss','(213) 277-2647',ARRAY[]::text[],'(213) 277-2647',true,true,'3873 Royal Woods Dr Sherman Oaks, CA 91403','TruePeopleSearch','TruePeopleSearch','CSV_IMPORT','prospect_leads_with_phones__2_','prospect_leads_with_phones__2_.csv','TruePeopleSearch','Direct'::public.lead_source,'New Lead'::public.lead_stage,now(),now()),

(gen_random_uuid(),'4035 N Quivas St Denver, CO 80211','Anna and Jeremy','(617) 404-2102',ARRAY[]::text[],'(617) 404-2102',true,true,'4035 N Quivas St Denver, CO 80211','TruePeopleSearch','TruePeopleSearch','CSV_IMPORT','prospect_leads_with_phones__2_','prospect_leads_with_phones__2_.csv','TruePeopleSearch','Direct'::public.lead_source,'New Lead'::public.lead_stage,now(),now()),

(gen_random_uuid(),'41 Glowing Star Rd Santa Fe, NM 87506','R','(310) 663-6260',ARRAY[]::text[],'(310) 663-6260',true,true,'41 Glowing Star Rd Santa Fe, NM 87506','TruePeopleSearch','TruePeopleSearch','CSV_IMPORT','prospect_leads_with_phones__2_','prospect_leads_with_phones__2_.csv','TruePeopleSearch','Direct'::public.lead_source,'New Lead'::public.lead_stage,now(),now()),

(gen_random_uuid(),'410A Cookman Ave Asbury Park, NJ 07712','Zee Par','(919) 646-6088',ARRAY[]::text[],'(919) 646-6088',true,true,'410A Cookman Ave Asbury Park, NJ 07712','TruePeopleSearch','TruePeopleSearch','CSV_IMPORT','prospect_leads_with_phones__2_','prospect_leads_with_phones__2_.csv','TruePeopleSearch','Direct'::public.lead_source,'New Lead'::public.lead_stage,now(),now()),

(gen_random_uuid(),'412 E Yearling Rd Phoenix, AZ 85085','Julie Bradfeldt','(612) 965-7749',ARRAY[]::text[],'(612) 965-7749',true,true,'412 E Yearling Rd Phoenix, AZ 85085','TruePeopleSearch','TruePeopleSearch','CSV_IMPORT','prospect_leads_with_phones__2_','prospect_leads_with_phones__2_.csv','TruePeopleSearch','Direct'::public.lead_source,'New Lead'::public.lead_stage,now(),now()),

(gen_random_uuid(),'4202 W Sevilla St Tampa, FL 33629','Eric Walsh','(904) 572-1162',ARRAY[]::text[],'(904) 572-1162',true,true,'4202 W Sevilla St Tampa, FL 33629','TruePeopleSearch','TruePeopleSearch','CSV_IMPORT','prospect_leads_with_phones__2_','prospect_leads_with_phones__2_.csv','TruePeopleSearch','Direct'::public.lead_source,'New Lead'::public.lead_stage,now(),now()),

(gen_random_uuid(),'4222 E McLellan Cir Mesa, AZ 85205','Joe Cipollone','(909) 271-0408',ARRAY[]::text[],'(909) 271-0408',true,true,'4222 E McLellan Cir Mesa, AZ 85205','TruePeopleSearch','TruePeopleSearch','CSV_IMPORT','prospect_leads_with_phones__2_','prospect_leads_with_phones__2_.csv','TruePeopleSearch','Direct'::public.lead_source,'New Lead'::public.lead_stage,now(),now()),

(gen_random_uuid(),'4353 Alton Rd Miami Beach, FL 33140','Rachel I','(786) 822-8654',ARRAY[]::text[],'(786) 822-8654',true,true,'4353 Alton Rd Miami Beach, FL 33140','TruePeopleSearch','TruePeopleSearch','CSV_IMPORT','prospect_leads_with_phones__2_','prospect_leads_with_phones__2_.csv','TruePeopleSearch','Direct'::public.lead_source,'New Lead'::public.lead_stage,now(),now()),

(gen_random_uuid(),'436 2nd St Manhattan Beach, CA 90266','Kyle Geoghegan','(310) 374-3007',ARRAY[]::text[],'(310) 374-3007',true,true,'436 2nd St Manhattan Beach, CA 90266','TruePeopleSearch','TruePeopleSearch','CSV_IMPORT','prospect_leads_with_phones__2_','prospect_leads_with_phones__2_.csv','TruePeopleSearch','Direct'::public.lead_source,'New Lead'::public.lead_stage,now(),now()),

(gen_random_uuid(),'45495 Adler Ln Temecula, CA 92590','Suzanne E Jeffrey/ Jay Longley','(949) 738-5531',ARRAY[]::text[],'(949) 738-5531',true,true,'45495 Adler Ln Temecula, CA 92590','TruePeopleSearch','TruePeopleSearch','CSV_IMPORT','prospect_leads_with_phones__2_','prospect_leads_with_phones__2_.csv','TruePeopleSearch','Direct'::public.lead_source,'New Lead'::public.lead_stage,now(),now()),

(gen_random_uuid(),'4557 Camellia Ave North Hollywood, CA 91602','Han','(626) 654-2810',ARRAY[]::text[],'(626) 654-2810',true,true,'4557 Camellia Ave North Hollywood, CA 91602','TruePeopleSearch','TruePeopleSearch','CSV_IMPORT','prospect_leads_with_phones__2_','prospect_leads_with_phones__2_.csv','TruePeopleSearch','Direct'::public.lead_source,'New Lead'::public.lead_stage,now(),now()),

(gen_random_uuid(),'476 S Rice Rd Ojai, CA 93023','lisa kenton','(213) 668-7025',ARRAY[]::text[],'(213) 668-7025',true,true,'476 S Rice Rd Ojai, CA 93023','TruePeopleSearch','TruePeopleSearch','CSV_IMPORT','prospect_leads_with_phones__2_','prospect_leads_with_phones__2_.csv','TruePeopleSearch','Direct'::public.lead_source,'New Lead'::public.lead_stage,now(),now()),

(gen_random_uuid(),'47655 Chapel Hill Rd Palm Desert, CA 92260','Ari Goott','(801) 755-1144',ARRAY[]::text[],'(801) 755-1144',true,true,'47655 Chapel Hill Rd Palm Desert, CA 92260','TruePeopleSearch','TruePeopleSearch','CSV_IMPORT','prospect_leads_with_phones__2_','prospect_leads_with_phones__2_.csv','TruePeopleSearch','Direct'::public.lead_source,'New Lead'::public.lead_stage,now(),now()),

(gen_random_uuid(),'4781 Galendo St Woodland Hills, CA 91364','Carrie Gan','(323) 613-3414',ARRAY[]::text[],'(323) 613-3414',true,true,'4781 Galendo St Woodland Hills, CA 91364','TruePeopleSearch','TruePeopleSearch','CSV_IMPORT','prospect_leads_with_phones__2_','prospect_leads_with_phones__2_.csv','TruePeopleSearch','Direct'::public.lead_source,'New Lead'::public.lead_stage,now(),now()),

(gen_random_uuid(),'48713 Spring Rain Ct Indio, CA 92201','Almahdi A','(202) 329-3992',ARRAY[]::text[],'(202) 329-3992',true,true,'48713 Spring Rain Ct Indio, CA 92201','TruePeopleSearch','TruePeopleSearch','CSV_IMPORT','prospect_leads_with_phones__2_','prospect_leads_with_phones__2_.csv','TruePeopleSearch','Direct'::public.lead_source,'New Lead'::public.lead_stage,now(),now()),

(gen_random_uuid(),'491 Live Oaks Rd Santa Barbara, CA 93108','David Smith','(805) 507-3773',ARRAY[]::text[],'(805) 507-3773',true,true,'491 Live Oaks Rd Santa Barbara, CA 93108','TruePeopleSearch','TruePeopleSearch','CSV_IMPORT','prospect_leads_with_phones__2_','prospect_leads_with_phones__2_.csv','TruePeopleSearch','Direct'::public.lead_source,'New Lead'::public.lead_stage,now(),now()),

(gen_random_uuid(),'5051 Savannah St San Diego, CA 92110','Mike MacPherson','(657) 306-5453',ARRAY[]::text[],'(657) 306-5453',true,true,'5051 Savannah St San Diego, CA 92110','TruePeopleSearch','TruePeopleSearch','CSV_IMPORT','prospect_leads_with_phones__2_','prospect_leads_with_phones__2_.csv','TruePeopleSearch','Direct'::public.lead_source,'New Lead'::public.lead_stage,now(),now()),

(gen_random_uuid(),'5134 Pendleton St San Diego, CA 92109','Patrick Benton','(858) 353-7479',ARRAY[]::text[],'(858) 353-7479',true,true,'5134 Pendleton St San Diego, CA 92109','TruePeopleSearch','TruePeopleSearch','CSV_IMPORT','prospect_leads_with_phones__2_','prospect_leads_with_phones__2_.csv','TruePeopleSearch','Direct'::public.lead_source,'New Lead'::public.lead_stage,now(),now()),

(gen_random_uuid(),'5216 E Monte Cristo Ave Scottsdale, AZ 85254','Kimberly Bucher','(602) 799-5730',ARRAY[]::text[],'(602) 799-5730',true,true,'5216 E Monte Cristo Ave Scottsdale, AZ 85254','TruePeopleSearch','TruePeopleSearch','CSV_IMPORT','prospect_leads_with_phones__2_','prospect_leads_with_phones__2_.csv','TruePeopleSearch','Direct'::public.lead_source,'New Lead'::public.lead_stage,now(),now()),

(gen_random_uuid(),'528 S Gaylord St Denver, CO 80209','Peter Wall','(720) 790-6136',ARRAY[]::text[],'(720) 790-6136',true,true,'528 S Gaylord St Denver, CO 80209','TruePeopleSearch','TruePeopleSearch','CSV_IMPORT','prospect_leads_with_phones__2_','prospect_leads_with_phones__2_.csv','TruePeopleSearch','Direct'::public.lead_source,'New Lead'::public.lead_stage,now(),now()),

(gen_random_uuid(),'540 Owen Rd Santa Barbara, CA 93108','Vonna Tarnutzer','(949) 537-2214',ARRAY[]::text[],'(949) 537-2214',true,true,'540 Owen Rd Santa Barbara, CA 93108','TruePeopleSearch','TruePeopleSearch','CSV_IMPORT','prospect_leads_with_phones__2_','prospect_leads_with_phones__2_.csv','TruePeopleSearch','Direct'::public.lead_source,'New Lead'::public.lead_stage,now(),now()),

(gen_random_uuid(),'55555 Pebble Bch La Quinta, CA 92253','Blake Polisky','(818) 335-4764',ARRAY[]::text[],'(818) 335-4764',true,true,'55555 Pebble Bch La Quinta, CA 92253','TruePeopleSearch','TruePeopleSearch','CSV_IMPORT','prospect_leads_with_phones__2_','prospect_leads_with_phones__2_.csv','TruePeopleSearch','Direct'::public.lead_source,'New Lead'::public.lead_stage,now(),now()),

(gen_random_uuid(),'57513 Santa Rosa Trl La Quinta, CA 92253','Margie Dupuis','(310) 372-4019',ARRAY[]::text[],'(310) 372-4019',true,true,'57513 Santa Rosa Trl La Quinta, CA 92253','TruePeopleSearch','TruePeopleSearch','CSV_IMPORT','prospect_leads_with_phones__2_','prospect_leads_with_phones__2_.csv','TruePeopleSearch','Direct'::public.lead_source,'New Lead'::public.lead_stage,now(),now()),

(gen_random_uuid(),'5948 Abernathy Dr Los Angeles, CA 90045','Carly Drake','(414) 339-8982',ARRAY[]::text[],'(414) 339-8982',true,true,'5948 Abernathy Dr Los Angeles, CA 90045','TruePeopleSearch','TruePeopleSearch','CSV_IMPORT','prospect_leads_with_phones__2_','prospect_leads_with_phones__2_.csv','TruePeopleSearch','Direct'::public.lead_source,'New Lead'::public.lead_stage,now(),now()),

(gen_random_uuid(),'6 Black Cove Rd Meredith, NH 03253','Damian','(617) 404-4827',ARRAY[]::text[],'(617) 404-4827',true,true,'6 Black Cove Rd Meredith, NH 03253','TruePeopleSearch','TruePeopleSearch','CSV_IMPORT','prospect_leads_with_phones__2_','prospect_leads_with_phones__2_.csv','TruePeopleSearch','Direct'::public.lead_source,'New Lead'::public.lead_stage,now(),now()),

(gen_random_uuid(),'600 Port Side Dr Naples, FL 34103','Max Kelley','(239) 420-8055',ARRAY[]::text[],'(239) 420-8055',true,true,'600 Port Side Dr Naples, FL 34103','TruePeopleSearch','TruePeopleSearch','CSV_IMPORT','prospect_leads_with_phones__2_','prospect_leads_with_phones__2_.csv','TruePeopleSearch','Direct'::public.lead_source,'New Lead'::public.lead_stage,now(),now()),

(gen_random_uuid(),'6315 King Ct Denver, CO 80221','Corinne DiSalvo','(305) 842-2417',ARRAY[]::text[],'(305) 842-2417',true,true,'6315 King Ct Denver, CO 80221','TruePeopleSearch','TruePeopleSearch','CSV_IMPORT','prospect_leads_with_phones__2_','prospect_leads_with_phones__2_.csv','TruePeopleSearch','Direct'::public.lead_source,'New Lead'::public.lead_stage,now(),now()),

(gen_random_uuid(),'634 Lakota Ln Jackson, WY 83001','Michael Massie','(916) 659-6296',ARRAY[]::text[],'(916) 659-6296',true,true,'634 Lakota Ln Jackson, WY 83001','TruePeopleSearch','TruePeopleSearch','CSV_IMPORT','prospect_leads_with_phones__2_','prospect_leads_with_phones__2_.csv','TruePeopleSearch','Direct'::public.lead_source,'New Lead'::public.lead_stage,now(),now()),

(gen_random_uuid(),'6408 Weidlake Dr Los Angeles, CA 90068','Eli Harel','(818) 536-2146',ARRAY[]::text[],'(818) 536-2146',true,true,'6408 Weidlake Dr Los Angeles, CA 90068','TruePeopleSearch','TruePeopleSearch','CSV_IMPORT','prospect_leads_with_phones__2_','prospect_leads_with_phones__2_.csv','TruePeopleSearch','Direct'::public.lead_source,'New Lead'::public.lead_stage,now(),now()),

(gen_random_uuid(),'6471 N Ceylon St Denver, CO 80249','Alex Ruiz','(689) 329-3902',ARRAY[]::text[],'(689) 329-3902',true,true,'6471 N Ceylon St Denver, CO 80249','TruePeopleSearch','TruePeopleSearch','CSV_IMPORT','prospect_leads_with_phones__2_','prospect_leads_with_phones__2_.csv','TruePeopleSearch','Direct'::public.lead_source,'New Lead'::public.lead_stage,now(),now()),

(gen_random_uuid(),'6952 Solano Verde Dr Somis, CA 93066','Navreet Boparai','(805) 727-6124',ARRAY[]::text[],'(805) 727-6124',true,true,'6952 Solano Verde Dr Somis, CA 93066','TruePeopleSearch','TruePeopleSearch','CSV_IMPORT','prospect_leads_with_phones__2_','prospect_leads_with_phones__2_.csv','TruePeopleSearch','Direct'::public.lead_source,'New Lead'::public.lead_stage,now(),now()),

(gen_random_uuid(),'70 Baywood Ave Ross, CA 94957','Alison','(312) 874-5222',ARRAY[]::text[],'(312) 874-5222',true,true,'70 Baywood Ave Ross, CA 94957','TruePeopleSearch','TruePeopleSearch','CSV_IMPORT','prospect_leads_with_phones__2_','prospect_leads_with_phones__2_.csv','TruePeopleSearch','Direct'::public.lead_source,'New Lead'::public.lead_stage,now(),now()),

(gen_random_uuid(),'709 W Balboa Blvd Newport Beach, CA 92661','Brent L. Jose','(626) 772-6875',ARRAY[]::text[],'(626) 772-6875',true,true,'709 W Balboa Blvd Newport Beach, CA 92661','TruePeopleSearch','TruePeopleSearch','CSV_IMPORT','prospect_leads_with_phones__2_','prospect_leads_with_phones__2_.csv','TruePeopleSearch','Direct'::public.lead_source,'New Lead'::public.lead_stage,now(),now()),

(gen_random_uuid(),'73117 Haystack Rd Palm Desert, CA 92260','Marc Roffle','(517) 490-9979',ARRAY[]::text[],'(517) 490-9979',true,true,'73117 Haystack Rd Palm Desert, CA 92260','TruePeopleSearch','TruePeopleSearch','CSV_IMPORT','prospect_leads_with_phones__2_','prospect_leads_with_phones__2_.csv','TruePeopleSearch','Direct'::public.lead_source,'New Lead'::public.lead_stage,now(),now()),

(gen_random_uuid(),'7470 E Northern Ave Scottsdale, AZ 85258','Luciana Shaffer','(480) 485-9749',ARRAY[]::text[],'(480) 485-9749',true,true,'7470 E Northern Ave Scottsdale, AZ 85258','TruePeopleSearch','TruePeopleSearch','CSV_IMPORT','prospect_leads_with_phones__2_','prospect_leads_with_phones__2_.csv','TruePeopleSearch','Direct'::public.lead_source,'New Lead'::public.lead_stage,now(),now()),

(gen_random_uuid(),'748 Locust St Pasadena, CA 91101','Han','(626) 389-1170',ARRAY[]::text[],'(626) 389-1170',true,true,'748 Locust St Pasadena, CA 91101','TruePeopleSearch','TruePeopleSearch','CSV_IMPORT','prospect_leads_with_phones__2_','prospect_leads_with_phones__2_.csv','TruePeopleSearch','Direct'::public.lead_source,'New Lead'::public.lead_stage,now(),now()),

(gen_random_uuid(),'7502 Hillside Dr La Jolla, CA 92037','Eugenia Garcia','(619) 987-4851',ARRAY[]::text[],'(619) 987-4851',true,true,'7502 Hillside Dr La Jolla, CA 92037','TruePeopleSearch','TruePeopleSearch','CSV_IMPORT','prospect_leads_with_phones__2_','prospect_leads_with_phones__2_.csv','TruePeopleSearch','Direct'::public.lead_source,'New Lead'::public.lead_stage,now(),now()),

(gen_random_uuid(),'7601 Coquina Dr North Bay Village, FL 33141','Amine RB','(213) 845-2865',ARRAY[]::text[],'(213) 845-2865',true,true,'7601 Coquina Dr North Bay Village, FL 33141','TruePeopleSearch','TruePeopleSearch','CSV_IMPORT','prospect_leads_with_phones__2_','prospect_leads_with_phones__2_.csv','TruePeopleSearch','Direct'::public.lead_source,'New Lead'::public.lead_stage,now(),now()),

(gen_random_uuid(),'7611 Coquina Dr North Bay Village, FL 33141','Christian','(646) 880-9453',ARRAY[]::text[],'(646) 880-9453',true,true,'7611 Coquina Dr North Bay Village, FL 33141','TruePeopleSearch','TruePeopleSearch','CSV_IMPORT','prospect_leads_with_phones__2_','prospect_leads_with_phones__2_.csv','TruePeopleSearch','Direct'::public.lead_source,'New Lead'::public.lead_stage,now(),now()),

(gen_random_uuid(),'7730 E Gold Dust Ave Scottsdale, AZ 85258','adam justin katz','(480) 275-0939',ARRAY['(480) 444-6999','(480) 767-1335']::text[],'(480) 275-0939, (480) 444-6999, (480) 767-1335',true,true,'7730 E Gold Dust Ave Scottsdale, AZ 85258','TruePeopleSearch','TruePeopleSearch','CSV_IMPORT','prospect_leads_with_phones__2_','prospect_leads_with_phones__2_.csv','TruePeopleSearch','Direct'::public.lead_source,'New Lead'::public.lead_stage,now(),now()),

(gen_random_uuid(),'7746 E Nestling Way Scottsdale, AZ 85255','Ryan Leopold','(206) 207-9664',ARRAY[]::text[],'(206) 207-9664',true,true,'7746 E Nestling Way Scottsdale, AZ 85255','TruePeopleSearch','TruePeopleSearch','CSV_IMPORT','prospect_leads_with_phones__2_','prospect_leads_with_phones__2_.csv','TruePeopleSearch','Direct'::public.lead_source,'New Lead'::public.lead_stage,now(),now()),

(gen_random_uuid(),'78865 Starlight Ln Indio, CA 92203','Billy Long','(310) 663-1177',ARRAY[]::text[],'(310) 663-1177',true,true,'78865 Starlight Ln Indio, CA 92203','TruePeopleSearch','TruePeopleSearch','CSV_IMPORT','prospect_leads_with_phones__2_','prospect_leads_with_phones__2_.csv','TruePeopleSearch','Direct'::public.lead_source,'New Lead'::public.lead_stage,now(),now()),

(gen_random_uuid(),'79690 Rancho San Pascual La Quinta, CA 92253','Meredith Giraudi','(949) 547-2234',ARRAY[]::text[],'(949) 547-2234',true,true,'79690 Rancho San Pascual La Quinta, CA 92253','TruePeopleSearch','TruePeopleSearch','CSV_IMPORT','prospect_leads_with_phones__2_','prospect_leads_with_phones__2_.csv','TruePeopleSearch','Direct'::public.lead_source,'New Lead'::public.lead_stage,now(),now()),

(gen_random_uuid(),'80485 Old Ranch Trl N La Quinta, CA 92253','Kenneth Rosen','(323) 806-9000',ARRAY[]::text[],'(323) 806-9000',true,true,'80485 Old Ranch Trl N La Quinta, CA 92253','TruePeopleSearch','TruePeopleSearch','CSV_IMPORT','prospect_leads_with_phones__2_','prospect_leads_with_phones__2_.csv','TruePeopleSearch','Direct'::public.lead_source,'New Lead'::public.lead_stage,now(),now()),

(gen_random_uuid(),'81125 Golf View Dr La Quinta, CA 92253','Jennifer','(949) 776-5256',ARRAY[]::text[],'(949) 776-5256',true,true,'81125 Golf View Dr La Quinta, CA 92253','TruePeopleSearch','TruePeopleSearch','CSV_IMPORT','prospect_leads_with_phones__2_','prospect_leads_with_phones__2_.csv','TruePeopleSearch','Direct'::public.lead_source,'New Lead'::public.lead_stage,now(),now()),

(gen_random_uuid(),'8661 E Gail Rd Scottsdale, AZ 85260','Dina Beauvais','(480) 485-3930',ARRAY[]::text[],'(480) 485-3930',true,true,'8661 E Gail Rd Scottsdale, AZ 85260','TruePeopleSearch','TruePeopleSearch','CSV_IMPORT','prospect_leads_with_phones__2_','prospect_leads_with_phones__2_.csv','TruePeopleSearch','Direct'::public.lead_source,'New Lead'::public.lead_stage,now(),now()),

(gen_random_uuid(),'9265 Heartwood Dr Truckee, CA 96161','Justine Fairey','(415) 453-9448',ARRAY[]::text[],'(415) 453-9448',true,true,'9265 Heartwood Dr Truckee, CA 96161','TruePeopleSearch','TruePeopleSearch','CSV_IMPORT','prospect_leads_with_phones__2_','prospect_leads_with_phones__2_.csv','TruePeopleSearch','Direct'::public.lead_source,'New Lead'::public.lead_stage,now(),now()),

(gen_random_uuid(),'961 Banyan Dr Delray Beach, FL 33483','Rob','(561) 342-5588',ARRAY[]::text[],'(561) 342-5588',true,true,'961 Banyan Dr Delray Beach, FL 33483','TruePeopleSearch','TruePeopleSearch','CSV_IMPORT','prospect_leads_with_phones__2_','prospect_leads_with_phones__2_.csv','TruePeopleSearch','Direct'::public.lead_source,'New Lead'::public.lead_stage,now(),now()),

(gen_random_uuid(),'9871 E Gelding Dr Scottsdale, AZ 85260','Dina Beauvais','(623) 278-6682',ARRAY[]::text[],'(623) 278-6682',true,true,'9871 E Gelding Dr Scottsdale, AZ 85260','TruePeopleSearch','TruePeopleSearch','CSV_IMPORT','prospect_leads_with_phones__2_','prospect_leads_with_phones__2_.csv','TruePeopleSearch','Direct'::public.lead_source,'New Lead'::public.lead_stage,now(),now())

ON CONFLICT (id) DO NOTHING;

RAISE NOTICE 'Batch 2 complete: prospect_leads_with_phones__2_.csv (113 leads) inserted as Fully Verified';

END $$;
