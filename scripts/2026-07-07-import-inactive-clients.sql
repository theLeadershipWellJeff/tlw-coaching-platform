-- Import past clients into the Inactive roster (one-time data import, 2026-07-07).
-- Source: Coach Accountable inactive-roster CSV export.
--
-- Safe to re-run: anyone already in the roster (matched by email or by full
-- name, case-insensitive) is SKIPPED — existing clients are never modified,
-- and an active client is never flipped to inactive. New rows are inserted
-- with status='inactive' and linked to every non-supervisor coach row
-- (same single-coach-practice assumption as the 015 backfill).
--
-- The final SELECT reports how many were imported vs. skipped.

with incoming (name, email, phone, title, company, address, bio) as (
  values
    ('Alla Iagniatinskaia', 'allai.0505@gmail.com', '(617) 999-3074', null, null, 'Boston, United States', 'Added from Offering SPARK Resilience 90 Minute'),
    ('Allan Spahar', 'Allan.Spehar@caes.com', null, null, 'CAES', null, null),
    ('Amin Sawalha', 'a.sawalha@bankaletihad.com', null, 'Senior Director, Managerial Accounting', 'Bank al Etihad', null, null),
    ('Angelica Dannenberg', 'Angelica@wholebreads.com', null, null, null, null, null),
    ('Aram Yegenian', 'a.yegenian@bankaletihad.com', null, 'Director, Dev Ops', 'Bank al Etihad', null, null),
    ('Arpit Rahi', 'ceo@robraltechnologies.com', '+91 63972 24509', null, null, 'Dehradun, Utt, India', null),
    ('Astrid', 'vonsichart@t-online.de', '0049 171 7971785', null, null, 'Tübingen, Germany', 'Added from Offering SPARK Resilience 90 Min - Free'),
    ('Audrey Holmes', 'audreyaholmes@gmail.com', null, null, null, null, null),
    ('Bana Shennak', 'banashennak@gmail.com', null, null, null, 'Amman, Jordan', 'Added from Offering SPARK Resilience 90 Min - Free'),
    ('Bashar Ababneh', 'b.ababneh@bankaletihad.com', '00962796106111', null, 'Bank al Etihad', null, null),
    ('Bashar Faraj', 'b.faraj@bankaletihad.com', null, 'Senior Director, Treasury', 'Bank al Etihad', null, null),
    ('Betsy Seals', 'betsyseals@yahoo.com', null, null, null, null, null),
    ('Bill Schmitt', 'whschmitt@gmail.com', null, null, null, null, null),
    ('Bob Holmes', 'ironbob1@gmail.com', '512-294-0288', null, null, null, null),
    ('Brendan Campbell', 'Brendan@sonara.ai', null, null, 'Sonara.ai', null, null),
    ('Cameron Whyte', 'Cameron.stafford.whyte@gmail.com', '(480) 559-0566', null, null, null, null),
    ('Christina Dumitrascu', 'qapeachy@gmail.com', null, null, null, null, null),
    ('Christine Gilmore', 'dandcgilmore@gmail.com', '(415) 686-2378', null, 'PPI', '12 Thornton Ct, Novato, CA, 94945, United States', null),
    ('CP Drewett', 'cp@drewettworks.com', null, null, null, null, null),
    ('Dalal Dabbour', 'd.dabbour@bankaletihad.com', null, null, 'Bank al Etihad', null, null),
    ('Daniel Atlin', 'djatlin5@gmail.com', '(226) 820-6471', null, null, '82 Suffolk St W, Guelph, Ont, N1H 2J2, Canada', null),
    ('Danny Murphy', 'murphydh8@gmail.com', null, null, null, null, null),
    ('Dave Cooper', 'dave@verge.coach', '(757) 636-7111', null, null, 'Virginia Beach, United States', 'Added from Offering SPARK Resilience 90 Minute'),
    ('Dave Rohde', 'dkrohde@gmail.com', null, null, null, null, null),
    ('Dave Verdon', 'David.verdon@caes.com', null, null, 'CAES', null, null),
    ('David Avery', 'davery@grace-chapel.com', null, null, 'Leading Stronger', null, null),
    ('Davis Whyte', 'daviscwhyte@gmail.com', null, null, 'Scott Whyte', null, null),
    ('Derek Rago', 'derek.rago@gmail.com', null, null, null, null, null),
    ('Duha Bassam', 'duha.bassam@ogilvy.com', '(079) 690-8046', null, null, 'amman, Jordan', 'Added from Offering SPARK Resilience 90 Min - Free'),
    ('Emily Healy', 'eyhealy44@gmail.com', null, null, null, null, null),
    ('Eric Shipton', 'eshipton@hcg.com', null, null, 'Leading Stronger', null, null),
    ('Erik Sattler', 'erik@sattlersolar.com', '(858) 327-0334', null, null, '4768 Del Mar Ave., San Diego, CA, 92107, United States', null),
    ('Esme Owen', 'esmeraldamontenegroowen@gmail.com', null, null, 'Precious Stone PR', null, null),
    ('Estefany Servano', 'estefany@paulinaperrault.com', null, null, 'PPI', null, null),
    ('Fadi Marie', 'f.marie@bankaletihad.com', null, null, 'Bank al Etihad', null, null),
    ('Faisal Sarkhou', 'sarkhou@kamcoinvest.com', null, null, null, null, null),
    ('Fares Saifi', 'Faris.alsaify@ogilvy.com', '+962790268905', null, null, 'Amman, Jordan', 'Added from Offering SPARK Resilience 90 Min - Free'),
    ('Feras Arabiat', 'f.arabiat@bankaletihad.com', null, 'Senior Director, Technology', 'Bank al Etihad', null, null),
    ('Firas Al', 'firas.aljammal@ogilvy.com', '00962791480094', null, null, 'Amman, Jordan', 'Added from Offering SPARK Resilience 90 Min - Free'),
    ('Ford Smith', 'wfsmith@texasenterprises.com', '(512) 422-8821', null, 'SOLIDLeaders', null, null),
    ('Franca Wrage', 'info@francawrage.de', null, null, null, null, null),
    ('Friedrich Blomerus', 'bier.stripes.8o@icloud.com', null, null, null, 'Zurich, Austria', 'Added from Offering SPARK Resilience 90 Min - Free'),
    ('Grace Carter', 'gracebc813@gmail.com', '(510) 332-5514', null, null, 'Hayward, United States', null),
    ('Grace Kishek', 'g.kishek@bankaletihad.com', '00962777819118', 'Director, Marketing', 'Bank al Etihad', 'Amman, Jordan', null),
    ('Greg Hock', 'ghock@hockcompany.com', null, null, null, null, null),
    ('Greg Ligon', 'greg@leadingstronger.com', null, null, null, null, null),
    ('Hajar al Gosair', 'hajar.algosair@gmail.com', '+966504578995', null, null, null, null),
    ('Heather Calfee', 'speedyusafpm@gmail.com', null, null, null, null, null),
    ('Hiba Bursheh', 'h.bursheh@bankaletihad.com', null, 'Director, Total Rewards & Operations', 'Bank al Etihad', null, null),
    ('Ibrahim Nasir', 'i.nasir@bankaletihad.com', null, 'Tribe Lead - Digital Services', 'Bank al Etihad', null, null),
    ('Isam Samara', 'i.samara@bankaletihad.com', null, 'Senior Director, Corporate Communications and Marketing', 'Bank al Etihad', null, null),
    ('Jack Putano', 'jdputano@gmail.com', '(408) 384-1952', null, null, '205 hindiyeh Ln, San Martin, Ca, 95046, United States', null),
    ('Jackie Cruz', 'jcruz@hartnell.edu', null, null, null, null, null),
    ('Jacob Saperstein', 'jsaperstein77@gmail.com', null, null, null, null, null),
    ('Jan Freeman', 'jregalafreeman@gmail.com', null, null, null, null, null),
    ('Jarred Kotzin', 'kotzinjarred@gmail.com', '(480) 202-7538', null, 'Sonara.ai', null, null),
    ('Jeff Rutter', 'jeff.rutter@austinridge.org', null, null, 'Leading Stronger', null, null),
    ('Jennifer Tuck', 'jennifertuck@hotmail.com', '(647) 200-6945', null, null, 'Kitchener, Ontario, Canada', 'Added from Offering SPARK Resilience 90 Minute'),
    ('Jeremy Weir', 'jweir@fieldlevel.com', '(805) 223-5434', null, 'Field Level', null, null),
    ('Jessie Yarbrough', 'jessie.yarbrough@ofi.com', '(209) 918-4138', null, null, null, null),
    ('Joanne Flinn', 'jflinn@sheltonconsulting.con', '97893147', null, null, 'Singapore, Indonesia', 'Added from Offering SPARK Resilience 90 Min - Free'),
    ('John Beccaria', 'johnnybeccaria1961@gmail.com', '(831) 261-1848', null, null, '6638 Bogiala Way, Gilroy, CA, 95020, United States', null),
    ('Jon Moccabe', 'jonm@earthtechlandscape.com', null, null, 'Earthtech Landscape', null, null),
    ('Juhi', 'juhi@aparnabhasinconsulting.com', '(982) 031-7016', null, null, 'Mumbai, India', 'Added from Offering SPARK Resilience 90 Min - Free · Alt email: pande84@gmail.com'),
    ('Kate Bennett', 'Kate@paulinaperrault.com', null, null, 'PPI', null, null),
    ('Katie Smith', 'katielee_smith@yahoo.com', null, null, null, null, null),
    ('Katrina Dorsey', 'katrina.dorsey@hotmail.com', '(210) 724-9487', null, null, null, null),
    ('Kenneth Jones', 'kjones@levelupequitypartners.com', null, null, null, null, null),
    ('Kevin Cannella', 'kevin@thankyoulife.org', null, null, null, null, null),
    ('Khaled Gharaibeh', 'k.gharaibeh@bankaletihad.com', null, 'Director, Business Intelligence and Data Science', 'Bank al Etihad', null, null),
    ('Kristin Colino', 'kcolino@divinelyinspired.us', '(408) 858-3459', null, null, null, null),
    ('Krystina Yager', 'kmvyager@gmail.com', null, null, null, null, null),
    ('Lanny Rutkin', 'lanny@clickdealbuy.com', null, null, null, null, null),
    ('Lara Heskestad', 'lheskestad@gmail.com', null, null, null, null, null),
    ('Laura Geffre', 'laura@informed-choices.org', null, null, 'Informed Choices', null, null),
    ('Lauren Yaconis', 'lauren.yaconis@gmail.com', null, null, null, null, null),
    ('Lidia Luong', 'lidia@paulinaperrault.com', null, null, 'PPI', null, null),
    ('Luiz Eduardo Correa Pinto', 'luizeduardocp@me.com', '+5511933661977', null, null, 'Av. Santo Amaro, 5750, AP. 81, São Paulo, SP, 04702001, Brazil', null),
    ('Madhulika Mazumdar', 'madhulika.mazumdar@gmail.com', '09167593824', null, null, 'mumbai, India', 'Added from Offering SPARK Resilience 90 Min - Free'),
    ('Maen Hindawi', 'm.hindawi@bankaletihad.com', null, 'Senior Director, Retail Operations', 'Bank al Etihad', null, null),
    ('Maha Shurafa', 'ma.alshurafa@bankaletihad.com', null, 'Senior Director, Talent Management and OD', 'Bank al Etihad', null, null),
    ('Maher al Jamal', 'MaheralJamal@gmail.com', null, null, null, null, null),
    ('Mahmoud Badwan', 'm.badwan@bankaletihad.com', null, null, 'Bank al Etihad', null, null),
    ('Mahmoud Rousan', 'm.rousan@bankaletihad.com', null, 'Director, Integrations', 'Bank al Etihad', null, null),
    ('Majdi Asfour', 'm.asfour@bankaletihad.com', null, 'Segmentation Head', 'Bank al Etihad', null, null),
    ('Mark Genz', 'mark@genzassociates.com', null, null, null, null, null),
    ('Mark Hail', 'Mark.Hail@AustinRidge.org', null, null, 'Leading Stronger', null, null),
    ('Sara Alviti', 'Saraalviti@gmail.com', '(347) 393-9556', null, null, null, null),
    ('Maroun Nassar', 'Nassarmaroun@yahoo.com', null, null, null, 'Napa, CA, United States', null),
    ('Mason de', 'masondechochor@hotmail.com', '794458517', null, null, 'Geneva Switzerland', 'Added from Offering SPARK Resilience 90 Min - Free'),
    ('Matt Ahern', 'matthewahern23@gmail.com', null, null, null, null, null),
    ('Maya Jindal', 'mayajindal@gmail.com', '(832) 277-2156', null, null, 'Pune, India', 'Added from Offering SPARK Resilience 90 Min - Free'),
    ('Melanie Hock', 'melaniejanehock@gmail.com', null, null, null, null, null),
    ('Meriam Shanti', 'meriam.shanti@ogilvy.com', '+962795979982', null, null, null, null),
    ('Mervat Helu', 'm.helu@bankaletihad.com', '(077) 919-1902', 'Senior Director, Credit Administration', 'Bank al Etihad', 'Amman, Jordan', null),
    ('Michelle Koo', 'michellek@paulinaperrault.com', null, null, 'PPI', null, null),
    ('Mike Vommaro', 'MikeV@wearecode4.com', null, null, 'Code4', null, null),
    ('Mohammad Hatamleh', 'm.hatamleh@bankaletihad.com', null, null, 'Bank al Etihad', null, null),
    ('Mohammad Nashwan', 'mohammad.nashwan@ogilvy.com', '00962799081865', null, null, 'Amman, Jordan', 'Added from Offering SPARK Resilience 90 Min - Free'),
    ('Nathan Ryan', 'npr1230@gmail.com', '(512) 721-8382', null, null, null, null),
    ('Nick Neibauer', 'nick.neibauer@gmail.com', null, null, null, null, null),
    ('Norma Walks', 'Ntwalks@gmail.com', null, 'Cheif of Surgery @ Phoenix Indian Medical Center', null, null, null),
    ('Olivia Rauch', 'olivia.rauch95@gmail.com', null, null, null, null, null),
    ('Oriel Fernandes', 'ofernandes@clintonhealthaccess.org', '(857) 499-8617', null, null, 'KIGALI, South Africa', 'Added from Offering SPARK Resilience 90 Min - Free'),
    ('Orlando Gunn', 'orlando.gunn14@gmail.com', '(254) 214-9615', null, null, '5400 JAIN LANE APT 221, AUSTIN, TX, 78721, United States', null),
    ('Paulina Perrault', 'Paulina@paulinaperrault.com', null, null, 'PPI', null, null),
    ('Pouya Khakpour', 'Pouya@paulinaperrault.com', null, null, 'PPI', null, null),
    ('Rachel Ligon', 'rachell@tbarm.org', '(210) 618-7667', null, 'Leading Stronger', '218 T Bar M Dr, New Braunfels, TX, 78132, United States', null),
    ('Rahmeh Alfaouri', 'r.alfaouri@bankaletihad.com', null, 'Manager, IT Governance', 'Bank al Etihad', null, null),
    ('Rami Ma''ay''ah', 'r.tomah@bankaletihad.com', null, 'Director, Core Systems', 'Bank al Etihad', null, null),
    ('Rasha Mdanat', 'Ra.Madanat@bankaletihad.com', null, 'Senior Director, Retail Distribution', 'Bank al Etihad', null, null),
    ('Reem Mulla', 'r.mulla@bankaletihad.com', null, 'Head of Wealth Management', 'Bank al Etihad', null, null),
    ('Rich Mockabee', 'RichMockabee@aol.com', null, null, 'Earthtech Landscape', null, null),
    ('Robert Durbin', 'rdurbin@gbc-topeka.org', '(985) 691-4334', null, 'Leading Stronger', null, null),
    ('Robert Villa', 'robertv@earthtechlandscape.com', null, null, 'Earthtech Landscape', null, null),
    ('Ryan Michel', 'ryan@vectorremote.com', null, null, 'Vector Remote', null, null),
    ('Saad al Masri', 's.almasri@delta-ins.com', null, null, 'Delta Insurance', null, null),
    ('Sadie Guymer', 'sadieguymer74@gmail.com', null, null, null, null, null),
    ('Saleh Fleifel', 'Saleh.fleifel@gmail.com', '(009) 627-95654097', null, null, 'Amman, Jordan', 'Added from Offering SPARK Resilience 90 Minute'),
    ('Salma Shahatit', 's.shahatit@bankaletihad.com', '00962777904111', 'Director, Credit Risk and ICAAP', 'Bank al Etihad', null, null),
    ('Sarina LeSieur', 'sarinalesieur@gmail.com', null, null, null, '6820 Poca Montoya Dr., Granite Bay, CA, 95746, United States', null),
    ('Scott Davidson', 'scott@wearecode4.com', null, null, 'Code4', null, null),
    ('Shadi Shalabi', 's.shalabi@bankaletihad.com', null, 'Tech Tribe Leader', 'Bank al Etihad', null, null),
    ('Shaker Al Khalailah', 's.alkhalailah@bankaletihad.com', null, 'Senior Director, Retail Credit', 'Bank al Etihad', null, null),
    ('Shatha Bdair', 's.bdair@bankaletihad.com', '00962796487633', 'Senior Director, SMEs', 'Bank al Etihad', null, null),
    ('Shaun Ermel', 'shaun.ermel@spotless.com.au', '(047) 270-7349', null, 'the People Factor', null, null),
    ('Shekhar Pula', 'shekhar.pula@gmail.com', '(061) 000-1156', null, null, 'Amsterdam, Netherlands', 'Added from Offering SPARK Resilience 90 Minute'),
    ('Snezhana K', 'Pre.tone@icloud.com', null, null, null, null, null),
    ('Stephanie Werden', 'Stephblwerden@gmail.com', null, null, null, null, null),
    ('Suhail Jouaneh', 'Suhail@betterbusiness.com.jo', null, null, 'Bank al Etihad', null, null),
    ('Syed NAQVI', 'naqviha@yahoo.com', '+971506581768', null, null, 'Dubai, United Arab Emirates', 'Added from Offering SPARK Resilience 90 Min - Free'),
    ('Talha Koc', 'talhankoc@gmail.com', '(201) 887-3885', null, null, null, null),
    ('Tanisha Juan', 'officeadmin@earthtechlandscape.com', '(346) 234-5080', null, 'Earthtech Landscape', null, null),
    ('Tarek Koudsi', 't.koudsi@bankaletihad.com', null, 'Tech Tribe Leader', 'Bank al Etihad', null, null),
    ('Tarek Salfiti', 't.salfiti@bankaletihad.com', null, 'Board Member, Family Office CEO, G Proponent', 'Bank al Etihad', null, null),
    ('Tobias Borck', 'Tobiasborck@gmail.com', '0044 7548 576036', null, null, '41 Hardel Walk, London, SW2 2QG, United Kingdom', null),
    ('Ute Bock', 'u_bock@web.de', '+491726908917', null, null, 'Vacallo, Morocco', 'Added from Offering SPARK Resilience 90 Min - Free'),
    ('Val & Tim Duffy', 'Emphasisdrummer@gmail.com', '(408) 398-3993', null, null, null, null),
    ('Vanessa Thomas', 'vanessat47@yahoo.com', '(713) 882-7301', null, 'Leading Stronger', '20202 Louetta Ash Dr, Spring, Tx, 77388, United States', null),
    ('Wasim Salfiti', 'w.salfiti@bankaletihad.com', null, 'Senior Director, Product Management and Customer Experience', 'Bank al Etihad', null, null),
    ('William Owen', 'owenproperty1@gmail.com', '(408) 390-8869', null, 'Precious Stone PR', '1114 Valbusa Drive, Gilroy, CA, 95020, United States', null),
    ('Yukie Yasui', 'yukie.yasui@plan-a-consulting.de', '0049(0)15164514933', null, null, 'Oldenburg, Germany', 'Added from Offering SPARK Resilience 90 Min - Free'),
    ('Zeid Kamal', 'z.kamal@bankaletihad.com', '00962797476600', null, 'Bank al Etihad', null, null),
    ('Zeid Shawareb', 'z.shawareb@bankaletihad.com', null, 'Senior Director, Administration Department', 'Bank al Etihad', null, null),
    ('Zeinah Asfour', 'z.asfour@bankaletihad.com', null, 'Director, Operational Risk', 'Bank al Etihad', null, null)
),
skipped as (
  select i.name
  from incoming i
  where exists (
    select 1 from clients c
    where (c.email is not null and i.email is not null and lower(c.email) = lower(i.email))
       or lower(c.name) = lower(i.name)
  )
),
new_clients as (
  insert into clients (name, email, phone, title, company, address, bio, status)
  select i.name, i.email, i.phone, i.title, i.company, i.address, i.bio, 'inactive'
  from incoming i
  where not exists (
    select 1 from clients c
    where (c.email is not null and i.email is not null and lower(c.email) = lower(i.email))
       or lower(c.name) = lower(i.name)
  )
  returning id
),
linked as (
  insert into coach_clients (coach_id, client_id, role)
  select co.id, nc.id, 'primary'
  from new_clients nc
  cross join coaches co
  where coalesce(co.role, 'coach') <> 'supervisor'
  on conflict (coach_id, client_id) do nothing
  returning client_id
)
select
  (select count(*) from new_clients)                as imported,
  (select count(*) from skipped)                    as skipped_already_in_roster,
  (select string_agg(name, ', ' order by name) from skipped) as skipped_names;
