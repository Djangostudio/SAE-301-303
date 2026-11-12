/**
 * visDataPreprocessor.js : script chargé de fournir toutes les fonctions de préparation des données pour les visualisations.
 */

// garantie de ne pas polluer l'espace de noms de notre environnement javascript par  l'encapsulation de tout notre script dans l'exécution d'une fonction anonyme
(function () {
  /*
  Comme notre code-source est séparé en différents fichiers, nous rassemblons toutes nos fonctions ou autres données qui doivent être accessibles d'un script à l'autre
  dans une structure (un objet) global nommé MAINAPP. Dans chaque script, nous la créeons si elle n'existe pas, puis nous y déclarerons nos fonctions 
  */
  if (!window.MAINAPP) {
    // Création de MAINAPP
    window.MAINAPP = {};
  }
  // Creation dans MAINAPP de l'objet dédié à la gestion des données
  window.MAINAPP.vizDataPreprocessor = {};

  /**
   * Prépare les données pour la visualisation en carte de chaleur des salaire net moyens temps plein par discipline et par région.
   * Retour un tableau de nom de régions regionNoms, un tableau de nom de disciplines disciplineNoms, et un tableau de triplets [indexDiscipline, indexRegion, salaire], utilisable pour la visaluation heatmap
   * @param {Array} salairesAnneeRegDisc tableau de quadruplets [annee, regionId, discId, moyenne salaire]
   * @param {Object} regionsById dictionnaire de régions par région id
   * @param {Object} disicplinesById dictionnaire de disicplines par discipline id
   * @returns Objet {regionNoms, disciplineNoms, salaires}
   */
  window.MAINAPP.vizDataPreprocessor.prepareDataForSalaireHeatmap = function(salairesAnneeRegDisc, regionsById, disicplinesById) {
    // Nous devons générer 3 structures pour la heatmap: un tableau de noms de regions, un tableau de noms de discipline, 
    // et une liste de triplets [indice de la region du tableau de nom, indice de la discipline du tableau de nom, valeur du salaire ]

    // On commence donc par créer les tableau de nom, puis des dictionnaires idRegion->indice region du tableau de nom et idDiscipline -> indice discipline du tableau nom
    // que l'on utilisera pour générer le tableau de triplet par la suite
    const regionNoms = Object.values(regionsById).map(({ nom }) => nom);
    const disciplineNoms = Object.values(disicplinesById).map(({ nom }) => nom);
    const indexRegionById = Object.values(regionsById).reduce((dico, { id }, idx) => {
      dico[id] = idx;
      return dico;
    }, {});
    const indexDisciplineById = Object.values(disicplinesById).reduce((dico, { id }, idx) => {
      dico[id] = idx;
      return dico;
    }, {});

    // Pour les triplets, on ne va garder que pour chaque couple region-discipline le salaire de l'année la plus récente.
    // On commence donc par calculer un dictionnaire d'entrée par clé regionId-dicisplineId en mettant à jour l'entrée uniquement si l'année est plus récente
    const dicoTriplets = salairesAnneeRegDisc.reduce((dico, [annee, regionId, discId, salaireMoyen]) => {
      const key = `${regionId}-${discId}`;
      const entree = dico[key];
      if (entree) { // si l'entrée existe, on la met à jour uniquement si l'année du quadruplet courant est posterieur à l'année de l'entrée
        if (annee > entree.annee) {
          entree.annee = annee;
          entree.salaire = salaireMoyen;
        }
      } else { // si l'entrée n'existe pas encore pour le couple regionId-discId, on en créé une
        dico[key] = {
          regionId,
          discId,
          annee,
          salaire: salaireMoyen
        };
      }
      return dico;
    }, {});

    // On gérer ensuite le tableau de triplets à partir des valeur du dictionnaire de triplet en convertissant les id de region et discipline en index
    // des tableaux de nom avec nos dictionnaires indexRegionById et indexDisciplineById
    const tripletsSalaires = Object.values(dicoTriplets).map(({ regionId, discId, salaire }) => [indexRegionById[regionId],
    indexDisciplineById[discId], salaire]);

    // On met à jour du modèle de données 
    return {
      regionNoms,
      disciplineNoms,
      salaires: tripletsSalaires,
    };
  }

  /**
   * Prépare les données pour la visualisation en lignes de l'évolution dans le temps des salaire par région pour une discipline donnée (si selectedDisciplineId est non null) ou par discipline pour une région données (si selectedRegionId est non null).
   * Si selectedDisciplineId et selectedRegionId sont toutes les deux null ou toutes les deux non null, lèvre une exption.
   * Retour un tableau de nom de disicpline ou région (legendes), un tableau d'année (annees), un tableau de serie pour chaque ligne (series) et le nom de la visualition (vizName), utilisable pour la visaluation lines
   * @param {*} salairesAnneeRegDisc tableau de quadruplets [annee, regionId, discId, moyenne salaire]
   * @param {*} regionsById dictionnaire de régions par région id
   * @param {*} disicplinesById dictionnaire de disicplines par discipline id
   * @param {*} selectedDisciplineId id de la discipline selectionnée
   * @param {*} selectedRegionId id de la region selectionnée
   * @returns Objet {legendes, annees, series, vizName}
   */
  window.MAINAPP.vizDataPreprocessor.prepareDataForSalaireLines = function(salairesAnneeRegDisc, regionsById, disicplinesById, selectedDisciplineId=null, selectedRegionId=null) {
    /*
    Deux possibilités : soit l'utilisateur a choisi une discipline particulière (selectedDisciplineId)
    et il faut alors créer des series de salaires par région pour cette discipline, 
    soit l'utilisateur a choisi une région particulière (selectedRegionId)
    et il faut alors créer des series de salaires par discipline pour cette région.

    Pour rappel, la visualisation en lignes à besoin de trois tableaux :
    - les légendes : les noms de région ou discipline 
    - les années : utilisé pour l'axe X : un tabeau d'année trié par ordre croissant
    - les série : une par ligne (i.e. : par région ou discipline) avec pour chacune d'entre elle, le nom de la région/discipline et les salaire : un tableau
      de même taille que le tableau d'années avec le salaire pour chaque année (ou null si le salaire est inconnu pour une année donnée)
    */

    if (selectedDisciplineId == null && selectedRegionId == null) {
      throw new Error("Impossible de préparer les données pour la visu lines si ni une discipline ni une région n'est selectionnée");
    }
    if (selectedDisciplineId != null && selectedRegionId != null) {
      throw new Error("Impossible de préparer les données pour la visu lines si une discipline et une région sont toutes les deux selectionnéees");
    }

    if (selectedDisciplineId !== null) { // l'utilisateur a choisi une discipline
      // On commence par filtrer les quadruplets pour ne garder que ceux qui correspondent à la dicipline selectionnée
      const salairesFiltres = salairesAnneeRegDisc.filter(([, , disciplineId]) => disciplineId === selectedDisciplineId);

      // Calcul des légendes : à partir des quadruplets selectionnés, on récupère les regionIds dans un ensemble (Set, qui garanti l'unicité des région),
      // puis l'on transforme ce Set en tableau que l'on trasforme (map) en un tableau de noms de région en utilisant le disctionnaire regionsById,
      // Enfin, on trie ce tableau par ordre alphabétique pour un plus bel affichage sur la visualisation.
      const legendes = Array.from(new Set(salairesFiltres.map(([, regionId]) => regionId))) // le set garantie que chaque regionId n'apparaissent qu'une fois
        .map((regionId) => regionsById[regionId].nom) // on créer un tableau de nom région d'après les région ids
        .sort((rNom1, rNom2) => rNom1.localeCompare(rNom2)); // on trie le tableau par ordre alphabétique de nom de région

      // Calcul des années : de manière similaire, à partir des quadruplets selectionnés, on récupère les années dans un ensemble (Set, qui garanti l'unicité des années),
      // puis l'on transforme ce Set en un tableau d'années, que l'on trie enfin par ordre croissant
      const anneesConcernees = Array.from(new Set(salairesFiltres.map(([annee]) => annee))).sort((a1, a2) => a1 - a2);

      // Pour nous permettre ensuite à partir d'un quadruplet contenant l'année et le salaire, de placer ce salaire à la bonne case du tableau, il nous faut
      // pouvoir connaitre l'indice du tableau à partir de l'année. 
      // On calcule donc un dictionnaire annee -> idx année d'après le tableau anneesConcernees
      const anneesIdxByAnnee = Object.fromEntries(anneesConcernees.map((annee, idx) => [annee, idx]));

      // Calcul des serie : on doit créer une série par région, avec pour chaque série un tableau de salaire par année, de même taille que anneesConcernees
      // à partir de nos quadruplets filtrés on crée un dictionnaire idRegion -> Serie avec comme Serie un objet {nom; nom de la region, salaires : le tableau}
      const seriesByIdRegion = salairesFiltres.reduce((dico, [annee, regionId, , salaire]) => {
        let entree = dico[regionId]; // on tente de récupérer l'entrée de la série du dictionnaire, si celle-ci existe déjà)
        if (!entree) { //si l'entrée n'existe pas, on un créer une nouvelle pour la série, avec un tableau de salaire initialement remplis de valeurs null
          entree = {
            nom: regionsById[regionId].nom,
            salaires: Array(anneesConcernees.length).fill(null),
          };
          dico[regionId] = entree;
        }
        // Dans tous les cas, on place le salaire au bon indice du tableau d'après l'année
        const anneeIdx = anneesIdxByAnnee[annee];
        entree.salaires[anneeIdx] = salaire;
        return dico;
      }, {});

      // on met à jour le modèle avec nos tableaux de légendes, d'années et de serie ainsi que le nom de la vizualisation ("discipline xxx")
      return {
        legendes,
        annees: anneesConcernees,
        series: Object.values(seriesByIdRegion), // tableau de séries
        vizName: `discipline ${disicplinesById[selectedDisciplineId].nom}`,
      }
    } else { // l'utilisateur a choisi une région
      // Le traitement est sensiblement le même que pour une discipline selectionné.
      // On va filtrer les quadruplets d'après la region selectionnée,
      // puis créer un tableau de légendes contenant les disciplines concernées par les quadruplets selectionnés.
      // On va également créer un tableau d'années concerné, avec le dictionnaire année -> indice du tableau
      // Et enfin on va créer les séries de salaire par discipline

      // Quadruplets filtrés par regionId
      const salairesFiltres = salairesAnneeRegDisc.filter(([, regionId]) => regionId === selectedRegionId);
      // Légendes : noms des régions
      const legendes = Array.from(new Set(salairesFiltres.map(([, , disciplineId]) => disciplineId)))
        .map((disciplineId) => disicplinesById[disciplineId].nom)
        .sort((rNom1, rNom2) => rNom1.localeCompare(rNom2));
      // Années et disctionnaire année->index année
      const anneesConcernees = Array.from(new Set(salairesFiltres.map(([annee]) => annee))).sort((a1, a2) => a1 - a2);
      const anneesIdxByAnnee = Object.fromEntries(anneesConcernees.map((annee, idx) => [annee, idx]));
      // Le disctionnaire de série par disciplineId
      const seriesByIdDiscipline = salairesFiltres.reduce((dico, [annee, , disciplineId, salaire]) => {
        let entree = dico[disciplineId]; // on tente de récupérer l'entrée de la série du dictionnaire, si celle-ci existe déjà)
        if (!entree) { //si l'entrée n'existe pas, on un créer une nouvelle pour la série, avec un tableau de salaire initialement remplis de valeurs null
          entree = {
            nom: disicplinesById[disciplineId].nom,
            salaires: Array(anneesConcernees.length).fill(null),
          };
          dico[disciplineId] = entree;
        }
        // Dans tous les cas, on place le salaire au bon indice du tableau d'après l'année
        const anneeIdx = anneesIdxByAnnee[annee];
        entree.salaires[anneeIdx] = salaire;
        return dico;
      }, {});
      // Mise à jour du modèle
      return {
        legendes,
        annees: anneesConcernees,
        series: Object.values(seriesByIdDiscipline), // tableau de séries
        vizName: `région ${regionsById[selectedRegionId].nom}`,
      }
    }
  }

  // Fonctions de notre application : masters de droit

  /**
   * Fonction privée : calcule un pourcentage arrondi, ou null si le total est 0 ou absent
   */
  function pourcentage(partie, total) {
    if (!total || partie === null || partie === undefined) {
      return null;
    }
    return Math.round((partie / total) * 100);
  }

  /**
   * Fonction privée : lit le taux d'emploi stable (en %) d'une statistique d'insertion pro.
   * L'API ne fournit pas de "taux d'insertion" : emplois.stable est déjà un pourcentage
   * (part des répondants en emploi stable), on le prend tel quel.
   */
  function lireTauxEmploiStable(stat) {
    if (!stat.emplois || stat.emplois.stable === null || stat.emplois.stable === undefined) {
      return null;
    }
    return stat.emplois.stable;
  }

  /**
   * Liste des sessions (années de collecte) présentes dans les candidatures, de la plus récente à la plus ancienne
   * @param {Array} candidatures tableau stats.candidatures
   * @returns tableau d'années, ex. [2023, 2022, 2021]
   */
  window.MAINAPP.vizDataPreprocessor.listerSessions = function (candidatures) {
    return Array.from(new Set(candidatures.map(({ identifiants }) => identifiants.anneeCollecte)))
      .sort((a1, a2) => a2 - a1);
  }

  /**
   * Pour chaque établissement, garde la statistique d'insertion la plus récente
   * (et, à année égale, celle qui a le plus de réponses, donc la plus fiable).
   * @param {Array} insertionsPro tableau stats.insertionsPro
   * @returns dictionnaire uai -> {annee, nbReponses, tauxEmploiStable, echantillonFragile}
   */
  window.MAINAPP.vizDataPreprocessor.insertionParEtablissement = function (insertionsPro) {
    return insertionsPro.reduce((dico, stat) => {
      const uai = stat.identifiants.etabUai;
      const annee = stat.identifiants.anneeCollecte;
      const nbReponses = stat.general ? stat.general.nbResponses || 0 : 0;
      const entree = dico[uai];
      const plusRecente = !entree || annee > entree.annee;
      const memeAnneeMaisPlusDeReponses = entree && annee === entree.annee && nbReponses > entree.nbReponses;
      if (plusRecente || memeAnneeMaisPlusDeReponses) {
        dico[uai] = {
          annee,
          nbReponses,
          tauxEmploiStable: lireTauxEmploiStable(stat),
          echantillonFragile: stat.general ? Boolean(stat.general.pbEchantillon) : false,
        };
      }
      return dico;
    }, {});
  }

  /**
   * Construit la liste des formations de droit avec tous leurs indicateurs pour une session donnée.
   * @param {Array} formations formationsDroit
   * @param {Object} stats {candidatures, insertionsPro}
   * @param {Object} etablissementsByUai dictionnaire des établissements
   * @param {Object} academiesById dictionnaire des académies
   * @param {Object} mentionsById dictionnaire des mentions
   * @param {number} session année de collecte choisie
   * @returns tableau de formations enrichies
   */
  window.MAINAPP.vizDataPreprocessor.calculerIndicateursFormations = function (formations, stats, etablissementsByUai, academiesById, mentionsById, session) {
    // 1. dictionnaire ifc -> stat de candidature, uniquement pour la session choisie
    const candidatureParIfc = Object.fromEntries(stats.candidatures
      .filter(({ identifiants }) => identifiants.anneeCollecte === session)
      .map((stat) => [stat.identifiants.formationIfc, stat]));

    // 2. dictionnaire uai -> insertion la plus récente
    const insertionParUai = window.MAINAPP.vizDataPreprocessor.insertionParEtablissement(stats.insertionsPro);

    // 3. une formation enrichie par formation de droit
    return formations.map((formation) => {
      const etab = etablissementsByUai[formation.etabUai];
      const academie = etab ? academiesById[etab.academieId] : null;
      const mention = mentionsById[formation.mentionId];
      const candidature = candidatureParIfc[formation.ifc];
      const g = candidature ? candidature.general : null; // nombres de la formation (ou null si pas de stat)
      const insertion = insertionParUai[formation.etabUai] || null;

      return {
        // Formation, Etablissement, Academie, Mention
        idFormation: formation.ifc,
        parcours: formation.parcours,
        mentionId: formation.mentionId,
        mentionNom: mention ? mention.nom : '',
        alternance: formation.alternance,
        ville: formation.ville,
        etabUai: formation.etabUai,
        etabNom: etab ? etab.nom : formation.etabUai,
        academieId: etab ? etab.academieId : null,
        academieNom: academie ? academie.nom : '',
        // Candidater (nombres de l'API + taux calculés)
        capacite: g ? g.capacite : null,
        nbCandidats: g ? g.nb : null,
        nbAdmis: g ? g.accept : null,
        nbPropositions: g ? g.prop : null,
        rangDernierAppele: g ? g.rangDernier : null,
        tauxAcces: g ? pourcentage(g.prop, g.nb) : null,
        pctAdmisFemmes: g ? pourcentage(g.acceptFemmes, g.accept) : null,
        // InsererPro (niveau établissement)
        tauxEmploiStable: insertion ? insertion.tauxEmploiStable : null,
        nbReponses: insertion ? insertion.nbReponses : null,
        echantillonFragile: insertion ? insertion.echantillonFragile : false,
      };
    });
  }

  /**
   * Filtre les formations selon les choix de l'utilisateur.
   * Un filtre à null (ou false pour l'alternance) veut dire "pas de filtre".
   * @param {Array} formations formations avec indicateurs
   * @param {Object} filtres {mentionId, academieId, alternanceSeulement}
   * @returns tableau de formations filtrées
   */
  window.MAINAPP.vizDataPreprocessor.filtrerFormations = function (formations, filtres) {
    const { mentionId = null, academieId = null, alternanceSeulement = false } = filtres;
    return formations
      .filter((f) => mentionId === null || f.mentionId === mentionId)
      .filter((f) => academieId === null || f.academieId === academieId)
      .filter((f) => !alternanceSeulement || f.alternance);
  }

  /**
   * Trie les formations par ordre décroissant selon le critère choisi.
   * Les valeurs inconnues (null) sont toujours placées en fin de liste.
   * @param {Array} formations formations à trier
   * @param {string} tri 'acces' | 'emploiStable' | 'places'
   * @returns nouveau tableau trié
   */
  window.MAINAPP.vizDataPreprocessor.trierFormations = function (formations, tri) {
    const champParTri = { acces: 'tauxAcces', emploiStable: 'tauxEmploiStable', places: 'capacite' };
    const champ = champParTri[tri] || 'tauxAcces';
    return [...formations].sort((f1, f2) => {
      if (f1[champ] === null && f2[champ] === null) return 0;
      if (f1[champ] === null) return 1;  // f1 après f2
      if (f2[champ] === null) return -1; // f1 avant f2
      return f2[champ] - f1[champ];      // décroissant
    });
  }

  /**
   * Calcule les indicateurs clés de la sélection affichée.
   * @param {Array} formations formations affichées
   * @returns {nbFormations, capacite, nbCandidats, nbAdmis, tauxAccesGlobal, tauxEmploiStableMoyen}
   */
  window.MAINAPP.vizDataPreprocessor.calculerIndicateursCles = function (formations) {
    // somme d'un champ, en ignorant les valeurs inconnues
    const somme = (champ) => formations.reduce((total, f) => total + (f[champ] || 0), 0);

    // taux d'accès global : total des propositions / total des candidats,
    // uniquement sur les formations qui ont les deux nombres
    const avecStats = formations.filter((f) => f.nbCandidats && f.nbPropositions !== null);
    const totalCandidats = avecStats.reduce((t, f) => t + f.nbCandidats, 0);
    const totalPropositions = avecStats.reduce((t, f) => t + f.nbPropositions, 0);

    // emploi stable : un établissement ne compte qu'une fois
    // (ses formations ont toutes la même valeur, puisque l'API la donne par établissement)
    const emploiParEtab = {};
    formations.forEach((f) => {
      if (f.tauxEmploiStable !== null) {
        emploiParEtab[f.etabUai] = f.tauxEmploiStable;
      }
    });
    const valeursEmploi = Object.values(emploiParEtab);

    return {
      nbFormations: formations.length,
      capacite: somme('capacite'),
      nbCandidats: somme('nbCandidats'),
      nbAdmis: somme('nbAdmis'),
      tauxAccesGlobal: totalCandidats ? Math.round((totalPropositions / totalCandidats) * 100) : null,
      tauxEmploiStableMoyen: valeursEmploi.length
        ? Math.round(valeursEmploi.reduce((t, v) => t + v, 0) / valeursEmploi.length)
        : null,
    };
  }

}());

//remplacer par nos fonctions avec nos infos, ça va aussi nous aider pour tout ce qui est filtrage et tri