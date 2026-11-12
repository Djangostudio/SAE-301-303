/**
 * main.js : script "point d'entrée" de notre application web. S'appuie sur les fonctions proposées par les autres scritp et organise l'orchestration de l'application 
 */

// garantie de ne pas polluer l'espace de noms de notre environnement javascript par  l'encapsulation de tout notre script dans l'exécution d'une fonction anonyme
(function () {

    // Secteurs disciplinaires de droit retenus (GET /secteurs-disciplinaires) :
  // 36 Sciences juridiques, 37 Sciences politiques, 61 Pluridisciplinaire droit, sciences politiques
  const SECTEURS_RETENUS = [36, 37, 61];
  // Discipline "Droit, sciences politiques" (disciplineId des secteurs 36, 37, 61)
  const DISCIPLINE_DROIT = 1;
  // Disciplines d'insertion pro. de ces secteurs (champ insDiscId) : 36 -> disc02, 37 et 61 -> disc01
  const INS_DISC_RETENUES = ['disc01', 'disc02'];

  function creerMoyennesSalairesParAnneeRegionDiscipline() {
    const {storage} = window.MAINAPP;
    // On part d'une liste de stats avec plusieurs salaires médian pour chaque annee, region, disciplineS
    // on doit générer des quadruplet [anne, regiosId, disciplineId, moyenne des salaire]
    // On retirera du comptage toutes les stats dont les salaires ne sont pas mentionnés (null) ou à 0 (incohérent)

    // On commence par filtrer les stats pour enlever les mauvais salaire, puis pour chaque 
    //stat restantes, générer autant de triplets qu'elles ont de disciplineId, 
    const quadrupletsBruts = storage.get('stats').insertionsPro
      .filter(({ salaire }) => salaire.netMedianTempsPlein) // On ne garde que les stats dont le salaire net médian est non null et > 0
      .map(({ identifiants, relations, salaire }) => [identifiants.anneeCollecte, relations.regionId, relations.discIds, salaire.netMedianTempsPlein]) // on extrait des stats que les informations dont on a besoin : annee, regionId, liste des discipline ids, salaire median
      .flatMap(([annee, regionId, discIds, salaire]) => discIds.map((discId) => [annee, regionId, discId, salaire])); // on création des triplet année, regionId, disciplineId, salaire

    // On collecte ensuite dans un dictionnaire la somme et le nombre de salaire par annee-regionId-disciplineId en vue du calcul de la moyenne
    const dicoQuadruplets = quadrupletsBruts.reduce((dico, [annee, regionId, discId, salaire]) => {
      // calcul de la "clé" du dico
      const key = `${annee}-${regionId}-${discId}`;
      // On tente de récupérer l'entrée existante pour cette clé
      const entree = dico[key];
      if (entree) { // si l'entrée existe on ajoute le salaire à la somme et on incrémente le nombre de salaires
        entree.sommeSalaires += salaire;
        entree.nbSalaires += 1;
      } else { // si l'entrée n'existe pas on en créé une nouvelle avec comme somme initiale le salaire, et les information d'identification de base
        dico[key] = {
          annee,
          regionId,
          discId,
          sommeSalaires: salaire,
          nbSalaires: 1
        };
      }
      return dico;
    }, {});

    // On créé un tableau avec chaque valeur du dico, puis l'on génère pour chacun d'entre elle un quadruplet  [anne, regiosId, disciplineId, moyenne des salaire]
    const quadruplets = Object.values(dicoQuadruplets).map(({ annee, regionId, discId, sommeSalaires, nbSalaires }) => [annee, regionId, discId, Math.round(sommeSalaires / nbSalaires)]);

    // on met à jour le modèle de données
    storage.set('salairesAnneeRegDisc', quadruplets);
  }

  /**
   * Fonction à appeler dès que les données changent, pour mettre à jour les visualisation
   */
  function updateVisualisations({ updateSalaireHeatmap = false, updateSalaireLines = false }) {
    const {viz, storage, vizDataPreprocessor} = window.MAINAPP;
    if (updateSalaireHeatmap) {
      // Prépare les données pour la heatmap de salaires
      const {regionNoms, disciplineNoms, salaires} = vizDataPreprocessor.prepareDataForSalaireHeatmap(
        storage.get('salairesAnneeRegDisc'), 
        storage.get('regionsById'), 
        storage.get('disicplinesById'));
      // met à jour le titre de la visualisation
      viz.updateSalaireHeatmapTitle(regionNoms.length, disciplineNoms.length);
      // met à jour la heatmap de salaires
      viz.updateSalaireHeatmapData(regionNoms, disciplineNoms, salaires);
    }
    if (updateSalaireLines) {
      const {legendes, annees, series, vizName} = vizDataPreprocessor.prepareDataForSalaireLines(
        storage.get('salairesAnneeRegDisc'), 
        storage.get('regionsById'), 
        storage.get('disicplinesById'), 
        storage.get('selectedDisciplineId'), 
        storage.get('selectedRegionId'));
      // met à jour le titre de la visualisation
      viz.updateSalaireLinesTitle(vizName);
      // met à jour la vis lines de salaires
      viz.updateSalaireLinesData(legendes, annees, series);
    }
  }

  function onSelectDisciplineByNom(disciplineNom) {
    const {storage} = window.MAINAPP;
    // Récupération de la discipline
    const discipline = Object.values(storage.get('disicplinesById')).find(({ nom }) => nom === disciplineNom);
    // si la discipline existe, positionne le choix de l'utilisateur dans le modèle de données 
    // puis met à jour la visualisation de ligne de salaire
    if (discipline) {
      storage.set('selectedRegionId', null);
      storage.set('selectedDisciplineId', discipline.id);
      updateVisualisations({ updateSalaireLines: true });
    } else {
      console.warn('No discipline found for name ' + disciplineNom);
    }
  }

  function onSelectRegionByNom(regionNom) {
    const {storage} = window.MAINAPP;
    // Récupération de la région
    const region = Object.values(storage.get('regionsById')).find(({ nom }) => nom === regionNom);
    // si la discipline existe, positionne le choix de l'utilisateur dans le modèle de données 
    // puis met à jour la visualisation de ligne de salaire
    if (region) {
      storage.set('selectedRegionId', region.id);
      storage.set('selectedDisciplineId', null);
      updateVisualisations({ updateSalaireLines: true });
    } else {
      console.warn('No region found for name ' + regionNom);
    }
  }
  /**
   * Charge les formations des secteurs de droit, puis ne garde dans le storage
   * que les établissements qui proposent au moins une de ces formations.
   */
  function chargerFormationsEtEtablissementsDroit() {
    const { network, storage } = window.MAINAPP;
    // Un GET /formations par secteur, en parallèle
    return Promise.all(SECTEURS_RETENUS.map((secDiscId) => network.loadFormations(secDiscId)))
      .then((formationsParSecteur) => {
        // 1. un seul tableau avec toutes les formations de droit
        const formationsDroit = formationsParSecteur.flat();
        storage.set('formationsDroit', formationsDroit);
        // 2. uai des établissements ayant au moins une formation de droit (Set = sans doublon)
        const uaiDroit = new Set(formationsDroit.map((f) => f.etabUai));
        // 3. on ne garde que ces établissements
        const tous = storage.get('etablissementsByUai');
        const etablissementsDroit = Object.fromEntries(
          Object.entries(tous).filter(([uai]) => uaiDroit.has(uai))
        );
        storage.set('etablissementsByUai', etablissementsDroit);
      });
  }

    /**
   * Ne garde que les mentions dont le secteur disciplinaire fait partie des secteurs de droit retenus.
   * Les mentions sont triées par ordre alphabétique pour l'affichage.
   */
  function filtrerMentionsDroit() {
    const { storage } = window.MAINAPP;
    const mentionsDroit = Object.values(storage.get('mentionsById'))
      .filter((mention) => SECTEURS_RETENUS.includes(mention.secDiscId))
      .sort((m1, m2) => m1.nom.localeCompare(m2.nom));
    storage.set('mentionsDroit', mentionsDroit);
  }

  /**
   * Charge les statistiques de droit en deux requêtes :
   *  - candidatures : filtre par secteur disciplinaire (fonctionne correctement)
   *  - insertion pro : filtre par discipline, car l'API se trompe sur les secteurs pour l'insertion,
   *    puis on ne garde que les disciplines d'insertion du droit
   * On range le résultat sous la même forme qu'avant : {candidatures, insertionsPro}
   */
  function chargerStatsDroit() {
    const { network, storage } = window.MAINAPP;

    const promesseCandidatures = network.requestStats(
      { secteurDisciplinaireIds: SECTEURS_RETENUS },
      { typeStats: 'candidatures', candidatureDetails: 'general' }
    );

    const promesseInsertions = network.requestStats(
      { disciplineIds: DISCIPLINE_DROIT, moisApresDiplome: 30 },
      { typeStats: 'insertionsPro', insertionProDetails: ['general', 'emplois'] }
    );

    return Promise.all([promesseCandidatures, promesseInsertions])
      .then(([statsCandidatures, statsInsertions]) => {
        const insertionsDroit = statsInsertions.insertionsPro
          .filter((stat) => INS_DISC_RETENUES.includes(stat.identifiants.insDiscId));
        storage.set('stats', {
          candidatures: statsCandidatures.candidatures,
          insertionsPro: insertionsDroit,
        });
      });
  }

  /**
   * Recalcule les formations affichées et les indicateurs clés à partir des filtres du storage.
   * À appeler au démarrage, puis à chaque fois que l'utilisateur change un filtre.
   */
  function mettreAJourDonnees() {
    const { storage, vizDataPreprocessor: pre } = window.MAINAPP;
    const filtres = storage.get('filtres');

    // 1. indicateurs de toutes les formations de droit pour la session choisie
    const formations = pre.calculerIndicateursFormations(
      storage.get('formationsDroit'),
      storage.get('stats'),
      storage.get('etablissementsByUai'),
      storage.get('academiesById'),
      storage.get('mentionsById'),
      filtres.session);

    // 2. filtres, puis tri
    const formationsAffichees = pre.trierFormations(pre.filtrerFormations(formations, filtres), filtres.tri);

    // 3. on range le résultat dans le modèle
    storage.set('formationsAffichees', formationsAffichees);
    storage.set('indicateursCles', pre.calculerIndicateursCles(formationsAffichees));
  }

  /**
   * Fonction "point d'entrée de l'application", la première qui sera exécutée
   */
  function main() {
    if (!window.MAINAPP) {
      throw new Error('window.MAINAPP non disponible');
    }
    const { network, storage } = window.MAINAPP;

    // Promesse 1 : entités, puis formations et établissements de droit, puis mentions de droit
    const promesseEntites = network.loadEntities()
      .then(({ academiesById, regionsById, secteursDiscById, disicplinesById, etablissementsByUai, mentionsById }) => {
        storage.set('academiesById', academiesById);
        storage.set('regionsById', regionsById);
        storage.set('secteursDiscById', secteursDiscById);
        storage.set('disicplinesById', disicplinesById);
        storage.set('etablissementsByUai', etablissementsByUai);
        storage.set('mentionsById', mentionsById);
        filtrerMentionsDroit();
        // les établissements doivent être en mémoire avant de les filtrer
        return chargerFormationsEtEtablissementsDroit();
      });

    // Promesse 2 : statistiques (ne dépend pas des entités, donc lancée en même temps)
    const promesseStats = chargerStatsDroit();

    // On attend les deux avant de continuer
    Promise.all([promesseEntites, promesseStats])
      .then(() => {
        const pre = window.MAINAPP.vizDataPreprocessor;

        // sessions disponibles (la plus récente en premier)
        const sessions = pre.listerSessions(storage.get('stats').candidatures);
        storage.set('sessions', sessions);

        // filtres par défaut : session la plus récente, pas d'autre filtre, tri par taux d'accès
        storage.set('filtres', {
          session: sessions[0],
          mentionId: null,
          academieId: null,
          alternanceSeulement: false,
          tri: 'acces',
        });

        mettreAJourDonnees();

        console.log('Sessions :', sessions);
        console.log('Indicateurs clés :', storage.get('indicateursCles'));
        console.table(storage.get('formationsAffichees').slice(0, 10));
        // TODO : affichage
      })
      .catch((erreur) => console.error(erreur));
  }

  

  /*
  On doit exécuter main uniquement lorsque le DOM (page web) est "prête", pour que tous les autres scripts soient chargée (et donc toutes les fonctions de window.MAINAPP soient disponibles).
  2 cas de figure sont possible à l'exécution de ce script :
    - le document est déjà complètement chargé, à savoir le document et les sous-ressources dont les scripts sont tous chargés (statut "complete") ou le document est chargé et ses ressources comme les scripts sont chargés en en cours d'exécution (statut "interactive") : on peut alors exécuter main sans risque au prochain "tick" du navigateur (i.e.: on le laisse finir d'exécuter les scripts en attente d'exécution puis on exécute la fonction, en mettant en place un timeout à 1ms)
    - le document n'est pas encore chargé : on met en place une découte d'évènement "DOMContentLoad" qui sera déclenchée une fois la parge en état interactif, et l'on pourra alors éxecter directement la fonction (on enlevera au préalable notre écoute sur l'évènement pour éviter des appels multiples à notre fonction en cas de bug du navigateur)
  */

    // Test de l'état du document
    if (document.readyState === "complete" || document.readyState === "interactive") {
      // Document complète chargé ou presque : on peut exécuter notre fonction main au prochain tick
      setTimeout(main, 1);
    } else {
      // Document pas prêt, mis en place de l'écoute de l'évènement DOMContentLoaded
      // déclaration du handler de l'évènement en amont pour pouvoir y faire référence lorsque l'on se désabonnera de l'écoute
      const onContentLoaded = () => {
        // désabonnement
        document.removeEventListener("DOMContentLoaded", onContentLoaded);
        // appel de main
        main();
      }
      // Mise en place de l'écoute
      document.addEventListener("DOMContentLoaded", onContentLoaded);
    }
}());